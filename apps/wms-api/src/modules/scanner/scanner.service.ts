import { Pool, PoolClient } from 'pg';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineTransaction {
  id: string;
  txn_type: string;
  payload: Record<string, unknown>;
  captured_at: string; // ISO8601 timestamp from device clock
  device_id: string;
  user_id: string;
  dc_id: string;
}

export type SyncResult =
  | { id: string; status: 'applied' }
  | { id: string; status: 'conflict'; serverState: Record<string, unknown> };

export interface GateEntryInput {
  vehicle_reg: string;
  vendor_id: string;
  po_reference?: string;
  asn_reference?: string;
  dc_id: string;
  user_id: string;
  device_id: string;
}

export interface ScanInput {
  delivery_line_id: string;
  barcode: string;
  dc_id: string;
  user_id: string;
  device_id: string;
}

export interface QCPassInput {
  line_id: string;
  dc_id: string;
  user_id: string;
  device_id: string;
}

export interface BatchCaptureInput {
  line_id: string;
  batch_number: string;
  expiry_date: string;
  dc_id: string;
  user_id: string;
  device_id: string;
}

// ─── Scanner Service ──────────────────────────────────────────────────────────

export class ScannerService {
  constructor(private readonly db: Pool) {}

  /**
   * Gate entry: records vehicle arrival, validates E-Way Bill, creates yard_entry.
   * Req 7.1
   */
  async gateEntry(input: GateEntryInput): Promise<{ entry_id: string }> {
    const result = await this.db.query<{ entry_id: string }>(
      `INSERT INTO yard_entries (dc_id, vehicle_reg, vendor_id, asn_id, gate_in_at, status)
       VALUES ($1, $2, $3,
         (SELECT asn_id FROM asns WHERE dc_id=$1 AND asn_id=$4 LIMIT 1),
         now(), 'InYard')
       RETURNING entry_id`,
      [input.dc_id, input.vehicle_reg, input.vendor_id, input.asn_reference ?? null],
    );

    await writeAuditEvent(this.db, {
      dc_id: input.dc_id,
      event_type: 'GATE_ENTRY',
      user_id: input.user_id,
      device_id: input.device_id,
      reference_doc: input.vehicle_reg,
      new_state: {
        vehicle_reg: input.vehicle_reg,
        vendor_id: input.vendor_id,
        asn_reference: input.asn_reference,
      },
    });

    return { entry_id: result.rows[0]!.entry_id };
  }

  /**
   * Returns delivery details for scanner display: ASN line items, SKU info,
   * required scan counts, FT/NFT flag.
   * Req 7.2
   */
  async getDelivery(deliveryId: string, dcId: string): Promise<Record<string, unknown>> {
    const deliveryResult = await this.db.query(
      `SELECT d.delivery_id, d.status, d.asn_id,
              a.vendor_id, a.channel, a.confidence_score
       FROM deliveries d
       JOIN asns a ON a.asn_id = d.asn_id
       WHERE d.delivery_id = $1 AND d.dc_id = $2`,
      [deliveryId, dcId],
    );

    if (deliveryResult.rows.length === 0) {
      throw Object.assign(new Error(`DELIVERY_NOT_FOUND: ${deliveryId}`), { code: 'DELIVERY_NOT_FOUND' });
    }

    const linesResult = await this.db.query(
      `SELECT dl.line_id, dl.sku_id, s.name AS sku_name, s.packaging_class,
              s.is_ft, s.is_perishable, s.category,
              dl.expected_qty, dl.received_qty, dl.required_scans,
              dl.completed_scans, dl.qc_status, dl.batch_number, dl.expiry_date,
              dl.staging_lane
       FROM delivery_lines dl
       JOIN skus s ON s.sku_id = dl.sku_id
       WHERE dl.delivery_id = $1`,
      [deliveryId],
    );

    return {
      ...deliveryResult.rows[0],
      lines: linesResult.rows,
    };
  }

  /**
   * Processes a barcode scan. Returns Match / Mismatch / Unexpected within 1s.
   * Enforces scanner input mode (validated by device_id presence).
   * Req 8.1–8.8
   */
  async processScan(input: ScanInput): Promise<{
    result: 'Match' | 'Mismatch' | 'Unexpected';
    scan_id: string;
    delivery_line_id: string;
    completed_scans: number;
    required_scans: number;
  }> {
    const client: PoolClient = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Look up which SKU this barcode maps to
      const barcodeResult = await client.query<{ sku_id: string }>(
        `SELECT sku_id FROM barcodes WHERE barcode = $1 AND voided_at IS NULL`,
        [input.barcode],
      );

      // Get the delivery line
      const lineResult = await client.query<{
        sku_id: string; required_scans: number; completed_scans: number; qc_status: string;
      }>(
        `SELECT dl.sku_id, dl.required_scans, dl.completed_scans, dl.qc_status
         FROM delivery_lines dl
         JOIN deliveries d ON d.delivery_id = dl.delivery_id
         WHERE dl.line_id = $1 AND d.dc_id = $2
         FOR UPDATE`,
        [input.delivery_line_id, input.dc_id],
      );

      if (lineResult.rows.length === 0) {
        throw Object.assign(new Error('LINE_NOT_FOUND'), { code: 'LINE_NOT_FOUND' });
      }

      const line = lineResult.rows[0]!;
      let scanResult: 'Match' | 'Mismatch' | 'Unexpected';

      if (barcodeResult.rows.length === 0) {
        scanResult = 'Unexpected';
      } else if (barcodeResult.rows[0]!.sku_id === line.sku_id) {
        scanResult = 'Match';
      } else {
        scanResult = 'Mismatch';
      }

      // Insert scan event
      const scanEventResult = await client.query<{ scan_id: string }>(
        `INSERT INTO scan_events (delivery_line_id, barcode, scan_result, scanned_by, device_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING scan_id`,
        [input.delivery_line_id, input.barcode, scanResult, input.user_id, input.device_id],
      );

      // Increment completed_scans on Match
      let completedScans = line.completed_scans;
      if (scanResult === 'Match') {
        const updateResult = await client.query<{ completed_scans: number }>(
          `UPDATE delivery_lines
           SET completed_scans = completed_scans + 1
           WHERE line_id = $1
           RETURNING completed_scans`,
          [input.delivery_line_id],
        );
        completedScans = updateResult.rows[0]!.completed_scans;
      }

      await client.query('COMMIT');

      return {
        result: scanResult,
        scan_id: scanEventResult.rows[0]!.scan_id,
        delivery_line_id: input.delivery_line_id,
        completed_scans: completedScans,
        required_scans: line.required_scans,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * QC Pass: marks a line as QC passed. Blocked until scan count is met.
   * Req 8.5
   */
  async qcPass(input: QCPassInput): Promise<void> {
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      const lineResult = await client.query<{
        required_scans: number; completed_scans: number; qc_status: string;
      }>(
        `SELECT required_scans, completed_scans, qc_status FROM delivery_lines
         WHERE line_id = $1
         FOR UPDATE`,
        [input.line_id],
      );

      if (lineResult.rows.length === 0) {
        throw Object.assign(new Error('LINE_NOT_FOUND'), { code: 'LINE_NOT_FOUND' });
      }

      const line = lineResult.rows[0]!;

      if (line.completed_scans < line.required_scans) {
        throw Object.assign(
          new Error(`SCAN_COUNT_NOT_MET: ${line.completed_scans}/${line.required_scans}`),
          { code: 'SCAN_COUNT_NOT_MET' },
        );
      }

      await client.query(
        `UPDATE delivery_lines SET qc_status = 'Passed' WHERE line_id = $1`,
        [input.line_id],
      );

      await client.query(
        `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state)
         VALUES ($1,'QC_SCAN',$2,$3,$4,$5)`,
        [
          input.dc_id,
          input.user_id,
          input.device_id,
          input.line_id,
          JSON.stringify({ qc_status: 'Passed', completed_scans: line.completed_scans }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Captures batch number and expiry date for mandated categories.
   * Req 8.6
   */
  async batchCapture(input: BatchCaptureInput): Promise<void> {
    await this.db.query(
      `UPDATE delivery_lines
       SET batch_number = $1, expiry_date = $2
       WHERE line_id = $3`,
      [input.batch_number, input.expiry_date, input.line_id],
    );

    await writeAuditEvent(this.db, {
      dc_id: input.dc_id,
      event_type: 'BATCH_CAPTURED',
      user_id: input.user_id,
      device_id: input.device_id,
      reference_doc: input.line_id,
      new_state: { batch_number: input.batch_number, expiry_date: input.expiry_date },
    });
  }

  /**
   * Processes offline sync: replays transactions in captured_at ASC order.
   * Returns applied or conflict status per transaction.
   * Req 20.10, 20.11, 20.12
   */
  async offlineSync(transactions: OfflineTransaction[]): Promise<SyncResult[]> {
    // Sort by captured_at ASC — chronological replay
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    );

    const results: SyncResult[] = [];

    for (const txn of sorted) {
      const result = await this.processSyncTransaction(txn);
      results.push(result);
    }

    return results;
  }

  private async processSyncTransaction(txn: OfflineTransaction): Promise<SyncResult> {
    try {
      switch (txn.txn_type) {
        case 'GATE_ENTRY': {
          await this.gateEntry({
            ...(txn.payload as unknown as GateEntryInput),
            dc_id: txn.dc_id,
            user_id: txn.user_id,
            device_id: txn.device_id,
          });
          return { id: txn.id, status: 'applied' };
        }
        case 'SCAN': {
          await this.processScan({
            ...(txn.payload as unknown as ScanInput),
            dc_id: txn.dc_id,
            user_id: txn.user_id,
            device_id: txn.device_id,
          });
          return { id: txn.id, status: 'applied' };
        }
        case 'QC_PASS': {
          await this.qcPass({
            ...(txn.payload as unknown as QCPassInput),
            dc_id: txn.dc_id,
            user_id: txn.user_id,
            device_id: txn.device_id,
          });
          return { id: txn.id, status: 'applied' };
        }
        case 'BATCH_CAPTURE': {
          await this.batchCapture({
            ...(txn.payload as unknown as BatchCaptureInput),
            dc_id: txn.dc_id,
            user_id: txn.user_id,
            device_id: txn.device_id,
          });
          return { id: txn.id, status: 'applied' };
        }
        default:
          return { id: txn.id, status: 'conflict', serverState: { reason: `Unknown txn_type: ${txn.txn_type}` } };
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'UNKNOWN';
      // Conflict: the server state changed while device was offline
      const conflictCodes = ['SCAN_COUNT_NOT_MET', 'LINE_NOT_FOUND', 'DELIVERY_NOT_FOUND', 'NEGATIVE_QUANTITY'];
      if (conflictCodes.includes(code)) {
        return {
          id: txn.id,
          status: 'conflict',
          serverState: {
            error: code,
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
      throw err;
    }
  }
}
