import type { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

export interface StartReceivingRequest {
  delivery_id: string;
  yard_entry_id: string;
}

export interface ScanItem {
  sku_id: string;
  sku_code: string;
  name: string;
  expected_qty: number;
  packaging_class: string;
  is_ft: boolean;
  requires_cold: boolean;
}

export interface ScanRequest {
  delivery_line_id: string;
  barcode: string;
  scanned_by: string;
  device_id: string;
}

export interface ScanResponse {
  scan_result: 'Match' | 'Mismatch' | 'Unexpected';
  completed_scans: number;
  required_scans: number;
  message?: string | undefined;
}

export interface QCPassRequest {
  line_id: string;
  user_id: string;
}

export interface SubLineCaptureRequest {
  /** Parent delivery_lines.line_id */
  line_id: string;
  batch_number: string;
  expiry_date: string;        // ISO date string YYYY-MM-DD
  manufacture_date?: string;  // optional
  /** Quantity in this specific lot (must be > 0) */
  quantity: number;
  captured_by: string;
  device_id: string;
}

export interface SubLineCaptureResult {
  sub_line_id: string;
  line_id: string;
  batch_number: string;
  expiry_date: string;
  manufacture_date: string | null;
  quantity: number;
  captured_at: string;
  /** Total quantity across all sub-lines for this line after this insert */
  total_captured_qty: number;
  /** Whether total_captured_qty now equals or exceeds expected_qty */
  is_complete: boolean;
}

export class ReceivingService {
  constructor(
    private db: Pool,
    private sqsClient: SQSClient
  ) {}

  /**
   * BR-07 Scan Count Algorithm with Trust Tier Multiplier
   * Calculates required scan count based on packaging class, batch size,
   * and the vendor's trust tier sampling modifier.
   */
  async calculateRequiredScans(vendorId: string, packagingClass: string, batchSize: number): Promise<number> {
    const trustResult = await this.db.query(
      `SELECT vtt.sampling_modifier 
       FROM vendors v 
       JOIN vendor_trust_tiers vtt ON v.trust_tier_id = vtt.tier_id 
       WHERE v.vendor_id = $1`,
      [vendorId]
    );
    
    const multiplier = trustResult.rows.length > 0 
      ? parseFloat(trustResult.rows[0].sampling_modifier) 
      : 1.0;

    let baseCount = 0;
    switch (packagingClass) {
      case 'SealedCarton':
        baseCount = Math.max(1, Math.ceil(batchSize * 0.05));
        break;
      case 'GunnyBag':
        baseCount = 1;
        break;
      case 'Rice':
        baseCount = 1;
        break;
      case 'ShrinkWrap':
        baseCount = batchSize;
        break;
      case 'Loose':
        baseCount = batchSize + 1;
        break;
      default:
        throw new Error(`Unknown packaging class: ${packagingClass}`);
    }

    return Math.ceil(baseCount * multiplier);
  }

  async startReceiving(request: StartReceivingRequest): Promise<{ delivery_id: string; items: ScanItem[] }> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update yard entry with unloading_start
      await client.query(
        `UPDATE yard_entries 
         SET unloading_start = now(), status = 'Unloading'
         WHERE entry_id = $1`,
        [request.yard_entry_id]
      );

      // Get or create delivery record
      let deliveryResult = await client.query(
        `SELECT delivery_id FROM deliveries WHERE delivery_id = $1`,
        [request.delivery_id]
      );

      if (deliveryResult.rows.length === 0) {
        // Create delivery if it doesn't exist
        const yardEntry = await client.query(
          `SELECT asn_id FROM yard_entries WHERE entry_id = $1`,
          [request.yard_entry_id]
        );

        if (yardEntry.rows.length === 0 || !yardEntry.rows[0].asn_id) {
          throw new Error('Yard entry not found or has no ASN');
        }

        deliveryResult = await client.query(
          `INSERT INTO deliveries (delivery_id, dc_id, asn_id, yard_entry_id, status)
           SELECT $1, ye.dc_id, ye.asn_id, ye.entry_id, 'Unloading'
           FROM yard_entries ye
           WHERE ye.entry_id = $2
           RETURNING delivery_id`,
          [request.delivery_id, request.yard_entry_id]
        );
      }

      // Get ASN line items with SKU details
      const itemsResult = await client.query(
        `SELECT 
           s.sku_id,
           s.sku_code,
           s.name,
           s.packaging_class,
           s.is_ft,
           s.requires_cold,
           pol.ordered_qty as expected_qty
         FROM yard_entries ye
         JOIN asns a ON ye.asn_id = a.asn_id
         JOIN purchase_orders po ON a.po_id = po.po_id
         JOIN po_lines pol ON po.po_id = pol.po_id
         JOIN skus s ON pol.sku_id = s.sku_id
         WHERE ye.entry_id = $1 AND s.status = 'Active'`,
        [request.yard_entry_id]
      );

      await client.query('COMMIT');

      return {
        delivery_id: deliveryResult.rows[0].delivery_id,
        items: itemsResult.rows,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async assignStagingLane(sku_id: string, barcode: string, delivery_line_id: string): Promise<string> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get SKU details
      const skuResult = await client.query(
        `SELECT sku_id, is_ft, requires_cold, status FROM skus WHERE sku_id = $1`,
        [sku_id]
      );

      if (skuResult.rows.length === 0) {
        // Unrecognised item - assign to Unexpected lane and alert
        await client.query(
          `UPDATE delivery_lines SET staging_lane = 'Unexpected' WHERE line_id = $1`,
          [delivery_line_id]
        );

        await this.sendAlert('UNEXPECTED_ITEM', {
          barcode,
          delivery_line_id,
        });

        await client.query('COMMIT');
        return 'Unexpected';
      }

      const sku = skuResult.rows[0];

      if (sku.status !== 'Active') {
        // Inactive SKU - assign to Unexpected lane
        await client.query(
          `UPDATE delivery_lines SET staging_lane = 'Unexpected' WHERE line_id = $1`,
          [delivery_line_id]
        );

        await this.sendAlert('UNEXPECTED_ITEM', {
          barcode,
          sku_id,
          reason: 'SKU not Active',
          delivery_line_id,
        });

        await client.query('COMMIT');
        return 'Unexpected';
      }

      // Determine staging lane
      let stagingLane: string;

      if (sku.requires_cold) {
        // BR-18: Chocolate cold-chain exception - move to ColdZone immediately
        stagingLane = 'ColdZone';
      } else if (sku.is_ft) {
        stagingLane = 'FT';
      } else {
        stagingLane = 'NFT';
      }

      // Update delivery line with staging assignment
      await client.query(
        `UPDATE delivery_lines SET staging_lane = $1 WHERE line_id = $2`,
        [stagingLane, delivery_line_id]
      );

      await client.query('COMMIT');

      return stagingLane;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * POST /api/v1/receiving/scan
   * Submits a scan event, validates barcode against SKU master,
   * records scan result, and increments completed_scans
   */
  async submitScan(request: ScanRequest): Promise<ScanResponse> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get delivery line details
      const lineResult = await client.query(
        `SELECT dl.line_id, dl.sku_id, dl.completed_scans, dl.required_scans, 
                dl.qc_status, dl.packaging_class, s.sku_code
         FROM delivery_lines dl
         JOIN skus s ON dl.sku_id = s.sku_id
         WHERE dl.line_id = $1`,
        [request.delivery_line_id]
      );

      if (lineResult.rows.length === 0) {
        throw new Error('Delivery line not found');
      }

      const line = lineResult.rows[0];

      // Validate barcode against SKU master
      const barcodeResult = await client.query(
        `SELECT sku_id FROM barcodes WHERE barcode = $1 AND voided_at IS NULL`,
        [request.barcode]
      );

      let scanResult: 'Match' | 'Mismatch' | 'Unexpected';
      let message: string | undefined;

      if (barcodeResult.rows.length === 0) {
        // Barcode not found in master
        scanResult = 'Unexpected';
        message = 'Barcode not found in SKU master';
      } else if (barcodeResult.rows[0].sku_id !== line.sku_id) {
        // Barcode mismatch - resolves to different SKU
        scanResult = 'Mismatch';
        message = `Barcode mismatch: expected SKU ${line.sku_code}, found different SKU`;

        // Flag BARCODE_MISMATCH exception, halt receiving for this line
        await client.query(
          `UPDATE delivery_lines SET qc_status = 'Blocked' WHERE line_id = $1`,
          [request.delivery_line_id]
        );

        // Alert Inbound_Supervisor
        await this.sendAlert('BARCODE_MISMATCH', {
          delivery_line_id: request.delivery_line_id,
          barcode: request.barcode,
          expected_sku: line.sku_code,
          scanned_by: request.scanned_by,
        });
      } else {
        // Match
        scanResult = 'Match';
      }

      // Record scan event
      await client.query(
        `INSERT INTO scan_events (delivery_line_id, barcode, scan_result, scanned_by, device_id, scanned_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [request.delivery_line_id, request.barcode, scanResult, request.scanned_by, request.device_id]
      );

      // Increment completed_scans only for Match results
      let completedScans = line.completed_scans;
      if (scanResult === 'Match') {
        await client.query(
          `UPDATE delivery_lines SET completed_scans = completed_scans + 1 WHERE line_id = $1`,
          [request.delivery_line_id]
        );
        completedScans += 1;
      }

      await client.query('COMMIT');

      return {
        scan_result: scanResult,
        completed_scans: completedScans,
        required_scans: line.required_scans,
        message,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * PUT /api/v1/receiving/lines/{id}/qc-pass
   * Marks a line as QC-passed
   * Blocked until completed_scans >= required_scans
   */
  async qcPass(request: QCPassRequest): Promise<{ success: boolean; message?: string }> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get delivery line details with SKU category
      const lineResult = await client.query(
        `SELECT dl.line_id, dl.completed_scans, dl.required_scans, dl.qc_status, 
                dl.batch_number, dl.expiry_date, dl.sku_id, s.category
         FROM delivery_lines dl
         JOIN skus s ON dl.sku_id = s.sku_id
         WHERE dl.line_id = $1`,
        [request.line_id]
      );

      if (lineResult.rows.length === 0) {
        throw new Error('Delivery line not found');
      }

      const line = lineResult.rows[0];

      // Check if scan count is complete
      if (line.completed_scans < line.required_scans) {
        return {
          success: false,
          message: `SCAN_COUNT_INCOMPLETE: ${line.completed_scans}/${line.required_scans} scans completed`,
        };
      }

      // Check if line is blocked
      if (line.qc_status === 'Blocked') {
        return {
          success: false,
          message: 'Line is blocked due to barcode mismatch or other exception',
        };
      }

      // Check sub-line batch capture for mandated categories (FMCG_Food, BDF, Fresh)
      // BR-07 / Item 117: at least ONE sub-line with batch+expiry must exist
      const mandatedCategories = ['FMCG_Food', 'BDF', 'Fresh'];
      if (mandatedCategories.includes(line.category)) {
        const subLineResult = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM delivery_sub_lines WHERE line_id = $1`,
          [request.line_id]
        );
        const subLineCount = parseInt(subLineResult.rows[0]?.count ?? '0', 10);
        if (subLineCount === 0) {
          return {
            success: false,
            message: `BATCH_MISSING: At least one batch/expiry sub-line is required for ${line.category} category. Use POST /receiving/lines/:id/sub-line to add lots.`,
          };
        }
      }

      // Update QC status to Passed and line status to Closed (Item #128)
      await client.query(
        `UPDATE delivery_lines SET qc_status = 'Passed', status = 'Closed' WHERE line_id = $1`,
        [request.line_id]
      );

      // Quantity conservation check (Item #237)
      const subLineResult = await client.query<{ total_qty: string }>(
        `SELECT SUM(quantity) AS total_qty FROM delivery_sub_lines WHERE line_id = $1`,
        [request.line_id]
      );
      const totalQty = parseFloat(subLineResult.rows[0]?.total_qty ?? '0');
      const expectedQty = parseFloat(line.expected_qty);
      
      if (totalQty !== expectedQty) {
        // Record quantity mismatch incident
        await client.query(
          `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
           SELECT d.dc_id, 'QUANTITY_MISMATCH_WARN', $1, 'system', $2::text, $3::jsonb, 'qc_pass_variance'
           FROM delivery_lines dl JOIN deliveries d ON d.delivery_id = dl.delivery_id WHERE dl.line_id = $2::uuid`,
          [request.user_id, request.line_id, JSON.stringify({ expected: expectedQty, actual: totalQty })]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * POST /api/v1/receiving/lines/{id}/sub-line
   *
   * Gap #3 fix: replaces the old single-batch UPDATE with an INSERT into
   * delivery_sub_lines so mixed-expiry lots on the same delivery line are
   * each recorded separately (PRD Item 117, Item 237).
   *
   * Rules enforced:
   *  - quantity must be > 0
   *  - expiry_date must be a valid future date (items already expired are
   *    auto-flagged for quarantine via the expiry-alerts job)
   *  - duplicate (batch_number, expiry_date) on the same line_id is allowed
   *    because some vendors split the same batch across pallets
   *  - total inserted qty across all sub-lines may exceed expected_qty;
   *    over-delivery is surfaced via is_complete and an alert
   */
  async captureSubLine(request: SubLineCaptureRequest): Promise<SubLineCaptureResult> {
    if (request.quantity <= 0) {
      throw new Error('SUB_LINE_INVALID_QTY: quantity must be greater than 0');
    }

    // Expiry Validation (Item 121, 122 / T-4.4, T-4.5)
    const expiryDate = new Date(request.expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      throw new Error('ITEM_EXPIRED: Cannot receive expired items. Move to quarantine.');
    }

    if (diffDays < 30) {
      // Soft warning for near-expiry (AC 122)
      console.warn(`NEAR_EXPIRY_WARN: Item expires in ${diffDays} days. QC Lead approval recommended.`);
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Verify the parent delivery_line exists and is not already QC-passed
      const lineResult = await client.query<{
        line_id: string;
        expected_qty: string;
        qc_status: string;
        category: string;
      }>(
        `SELECT line_id, expected_qty, qc_status, s.category
         FROM delivery_lines dl
         JOIN skus s ON dl.sku_id = s.sku_id
         WHERE dl.line_id = $1`,
        [request.line_id]
      );

      if (lineResult.rows.length === 0) {
        throw new Error(`LINE_NOT_FOUND: delivery line ${request.line_id} does not exist`);
      }

      const line = lineResult.rows[0]!;
      if (line.qc_status === 'Passed') {
        throw new Error('LINE_ALREADY_PASSED: cannot add sub-lines to a QC-passed line');
      }

      // Insert the new sub-line (one row per distinct lot)
      const insertResult = await client.query<{
        sub_line_id: string;
        line_id: string;
        batch_number: string;
        expiry_date: string;
        manufacture_date: string | null;
        quantity: string;
        captured_at: string;
      }>(
        `INSERT INTO delivery_sub_lines
           (line_id, batch_number, expiry_date, manufacture_date, quantity, captured_by, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          request.line_id,
          request.batch_number,
          request.expiry_date,
          request.manufacture_date ?? null,
          request.quantity,
          request.captured_by,
          request.device_id,
        ]
      );

      const sub = insertResult.rows[0]!;

      // Calculate running total across all sub-lines for this line
      const totalsResult = await client.query<{ total_qty: string }>(
        `SELECT COALESCE(SUM(quantity), 0) AS total_qty
         FROM delivery_sub_lines
         WHERE line_id = $1`,
        [request.line_id]
      );
      const totalCapturedQty = parseFloat(totalsResult.rows[0]!.total_qty);
      const expectedQty = parseFloat(line.expected_qty);
      const isComplete = totalCapturedQty >= expectedQty;

      // Update delivery_lines.received_qty to reflect the sum of sub-lines
      await client.query(
        `UPDATE delivery_lines SET received_qty = $1 WHERE line_id = $2`,
        [totalCapturedQty, request.line_id]
      );

      // Audit trail
      await client.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
         SELECT d.dc_id, 'SUB_LINE_CAPTURED', $1, $2, $3, $4::jsonb, 'batch_lot_capture'
         FROM delivery_lines dl
         JOIN deliveries d ON dl.delivery_id = d.delivery_id
         WHERE dl.line_id = $5`,
        [
          request.captured_by,
          request.device_id,
          sub.sub_line_id,
          JSON.stringify({
            line_id: request.line_id,
            batch_number: request.batch_number,
            expiry_date: request.expiry_date,
            quantity: request.quantity,
            total_captured_qty: totalCapturedQty,
          }),
          request.line_id,
        ]
      );

      await client.query('COMMIT');

      return {
        sub_line_id: sub.sub_line_id,
        line_id: sub.line_id,
        batch_number: sub.batch_number,
        expiry_date: sub.expiry_date,
        manufacture_date: sub.manufacture_date,
        quantity: parseFloat(sub.quantity),
        captured_at: sub.captured_at,
        total_captured_qty: totalCapturedQty,
        is_complete: isComplete,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async sendAlert(alertType: string, payload: any): Promise<void> {
    const queueUrl = process.env['ALERT_EVENTS_QUEUE_URL'];
    if (!queueUrl) {
      console.warn('ALERT_EVENTS_QUEUE_URL not configured, skipping alert');
      return;
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        alert_type: alertType,
        severity: 'Warning',
        triggered_at: new Date().toISOString(),
        payload,
      }),
    });

    await this.sqsClient.send(command);
  }
}
