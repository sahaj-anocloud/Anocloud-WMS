import { Pool } from 'pg';
import axios from 'axios';

export interface GRNInitiateRequest {
  deliveryId: string;
  dcId: string;
  userId: string;
  deviceId: string;
}

export interface GRNStatusResponse {
  deliveryId: string;
  status: string;
  grpoDocNumber?: string;
  grpoPostedAt?: Date;
  liabilityTs?: Date;
  lines: Array<{
    lineId: string;
    skuId: string;
    qcStatus: string;
    gkmStatus: string;
    gstStatus: string;
  }>;
}

export interface SAPGRPORequest {
  deliveryId: string;
  dcId: string;
  lines: Array<{
    lineId: string;
    skuId: string;
    poLineId: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
  }>;
}

export interface SAPGRPOResponse {
  grpoDocNumber: string;
  postingTimestamp: string;
  sapResponse: any;
}

export class GRNService {
  private sapIntegrationUrl: string;
  private maxRetries = 4;
  private retryDelays = [5000, 15000, 45000, 120000]; // 5s, 15s, 45s, 2min

  constructor(private db: Pool) {
    this.sapIntegrationUrl = process.env['SAP_INTEGRATION_URL'] || 'http://localhost:8080';
  }

  /**
   * Check if delivery is ready for Auto-GRN
   * Condition: ALL lines satisfy qc_status = 'Passed' AND gkm_status IN ('AutoAccepted', 'Approved') AND gst_status IN ('Matched', 'Resolved')
   */
  async checkAutoGRNEligibility(deliveryId: string, dcId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT COUNT(*) as total_lines,
              COUNT(CASE WHEN qc_status = 'Passed' 
                          AND gkm_status IN ('AutoAccepted', 'Approved')
                          AND gst_status IN ('Matched', 'Resolved')
                     THEN 1 END) as ready_lines
       FROM delivery_lines dl
       WHERE dl.delivery_id = $1
         AND dl.delivery_id IN (SELECT delivery_id FROM deliveries WHERE dc_id = $2)`,
      [deliveryId, dcId]
    );

    const { total_lines, ready_lines } = result.rows[0];
    return parseInt(total_lines) > 0 && parseInt(total_lines) === parseInt(ready_lines);
  }

  /**
   * Initiate Auto-GRN process
   * Transitions delivery to GRNInProgress and calls SAP Integration Service
   */
  async initiateAutoGRN(request: GRNInitiateRequest): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Check eligibility
      const isEligible = await this.checkAutoGRNEligibility(request.deliveryId, request.dcId);
      if (!isEligible) {
        throw new Error('Delivery is not eligible for Auto-GRN. Not all lines have passed QC, GKM, and GST checks.');
      }

      // Check if already GRN-complete (prevent duplicate GRPO)
      const deliveryResult = await client.query(
        `SELECT status, grpo_doc_number FROM deliveries WHERE delivery_id = $1 AND dc_id = $2`,
        [request.deliveryId, request.dcId]
      );

      if (deliveryResult.rows.length === 0) {
        throw new Error('Delivery not found or access denied');
      }

      const delivery = deliveryResult.rows[0];
      if (delivery.status === 'GRNComplete') {
        throw new Error('GRPO already posted for this delivery. Duplicate GRPO is not allowed.');
      }

      // Check for over-delivery (>5% variance) (Item 3 in request)
      const overDeliveryResult = await client.query(
        `SELECT dl.line_id, dl.sku_id, dl.po_line_id, dl.received_qty, pol.ordered_qty,
                (dl.received_qty / NULLIF(pol.ordered_qty, 0) - 1) * 100 as variance_pct
         FROM delivery_lines dl
         JOIN po_lines pol ON dl.po_line_id = pol.po_line_id
         WHERE dl.delivery_id = $1 AND (dl.received_qty / NULLIF(pol.ordered_qty, 0)) > 1.05`,
        [request.deliveryId]
      );

      if (overDeliveryResult.rows.length > 0) {
        for (const line of overDeliveryResult.rows) {
          await client.query(
            `INSERT INTO over_delivery_holds (delivery_id, line_id, sku_id, po_line_id, ordered_qty, received_qty, variance_pct, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending')
             ON CONFLICT DO NOTHING`,
            [request.deliveryId, line.line_id, line.sku_id, line.po_line_id, line.ordered_qty, line.received_qty, line.variance_pct]
          );
        }

        const pendingHolds = await client.query(
          `SELECT COUNT(*) FROM over_delivery_holds WHERE delivery_id = $1 AND status = 'Pending'`,
          [request.deliveryId]
        );

        if (parseInt(pendingHolds.rows[0].count) > 0) {
          throw new Error(`OVER_DELIVERY_HOLD: ${pendingHolds.rows[0].count} lines have >5% over-delivery. Inbound Manager approval required.`);
        }
      }

      // Transition to GRNInProgress
      await client.query(
        `UPDATE deliveries SET status = 'GRNInProgress' WHERE delivery_id = $1`,
        [request.deliveryId]
      );

      // Get delivery lines for GRPO (including sub-lines for mixed expiry)
      const linesResult = await client.query(
        `SELECT dl.line_id, dl.sku_id, dl.po_line_id, dl.received_qty,
                pol.unit_price, s.gst_rate, dl.promo_type,
                dsl.sub_line_id, dsl.batch_number, dsl.expiry_date, dsl.quantity as sub_qty
         FROM delivery_lines dl
         JOIN po_lines pol ON dl.po_line_id = pol.po_line_id
         JOIN skus s ON dl.sku_id = s.sku_id
         LEFT JOIN delivery_sub_lines dsl ON dsl.line_id = dl.line_id
         WHERE dl.delivery_id = $1
           AND dl.qc_status = 'Passed'`,
        [request.deliveryId]
      );

      const lines = linesResult.rows.map(row => ({
        lineId: row.line_id,
        subLineId: row.sub_line_id,
        skuId: row.sku_id,
        poLineId: row.po_line_id,
        quantity: row.sub_qty ? parseFloat(row.sub_qty) : parseFloat(row.received_qty),
        unitPrice: parseFloat(row.unit_price),
        gstRate: parseFloat(row.gst_rate),
        promoType: row.promo_type,
        batchNumber: row.batch_number,
        expiryDate: row.expiry_date
      }));

      await client.query('COMMIT');

      // Call SAP Integration Service with retry logic
      await this.postGRPOWithRetry(request, lines);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Post GRPO to SAP with exponential backoff retry
   */
  private async postGRPOWithRetry(request: GRNInitiateRequest, lines: any[]): Promise<void> {
    let lastError: any;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const sapRequest: SAPGRPORequest = {
          deliveryId: request.deliveryId,
          dcId: request.dcId,
          lines
        };

        const response = await axios.post<SAPGRPOResponse>(
          `${this.sapIntegrationUrl}/internal/sap/grpo`,
          sapRequest,
          { timeout: 5000 }
        );

        // Success - record GRPO
        await this.recordGRPOSuccess(request, response.data);
        return;

      } catch (error: any) {
        lastError = error;
        console.error(`SAP GRPO attempt ${attempt + 1} failed:`, error.message);

        // If this is not the last attempt, wait before retrying
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelays[attempt] ?? 10000);
        }
      }
    }

    // All retries failed
    await this.recordGRPOFailure(request, lastError);
    throw new Error(`SAP GRPO failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Record successful GRPO posting
   */
  private async recordGRPOSuccess(request: GRNInitiateRequest, sapResponse: SAPGRPOResponse): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const grpoPostedAt = new Date(sapResponse.postingTimestamp);

      // Update delivery to GRNComplete
      await client.query(
        `UPDATE deliveries 
         SET status = 'GRNComplete',
             grpo_doc_number = $1,
             grpo_posted_at = $2,
             liability_ts = $2
         WHERE delivery_id = $3`,
        [sapResponse.grpoDocNumber, grpoPostedAt, request.deliveryId]
      );

      // Mark all passed lines as Closed (Item #128 / UAT T-2.4)
      await client.query(
        `UPDATE delivery_lines SET status = 'Closed' WHERE delivery_id = $1 AND qc_status = 'Passed'`,
        [request.deliveryId]
      );

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          request.dcId,
          'GRPO_CONFIRMED',
          request.userId,
          request.deviceId,
          sapResponse.grpoDocNumber,
          JSON.stringify({
            deliveryId: request.deliveryId,
            grpoDocNumber: sapResponse.grpoDocNumber,
            postingTimestamp: sapResponse.postingTimestamp,
            sapResponse: sapResponse.sapResponse
          }),
          'Auto-GRN completed successfully'
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record GRPO failure and send alerts
   */
  private async recordGRPOFailure(request: GRNInitiateRequest, error: any): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Revert delivery to PendingGRN
      await client.query(
        `UPDATE deliveries SET status = 'PendingGRN' WHERE delivery_id = $1`,
        [request.deliveryId]
      );

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          request.dcId,
          'GRPO_FAILURE',
          request.userId,
          request.deviceId,
          request.deliveryId,
          JSON.stringify({
            deliveryId: request.deliveryId,
            errorMessage: error.message,
            attempts: this.maxRetries
          }),
          `SAP GRPO failed after ${this.maxRetries} attempts`
        ]
      );

      // Publish SAP_GRPO_FAILURE alert
      await client.query(
        `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, triggered_at, payload)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [
          request.dcId,
          'SAP_GRPO_FAILURE',
          'Critical',
          request.deliveryId,
          JSON.stringify({
            deliveryId: request.deliveryId,
            errorMessage: error.message,
            attempts: this.maxRetries
          })
        ]
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
   * Get GRN status for a delivery
   */
  async getGRNStatus(deliveryId: string, dcId: string): Promise<GRNStatusResponse> {
    const deliveryResult = await this.db.query(
      `SELECT d.delivery_id, d.status, d.grpo_doc_number, d.grpo_posted_at, d.liability_ts
       FROM deliveries d
       WHERE d.delivery_id = $1 AND d.dc_id = $2`,
      [deliveryId, dcId]
    );

    if (deliveryResult.rows.length === 0) {
      throw new Error('Delivery not found or access denied');
    }

    const delivery = deliveryResult.rows[0];

    const linesResult = await this.db.query(
      `SELECT line_id, sku_id, qc_status, gkm_status, gst_status
       FROM delivery_lines
       WHERE delivery_id = $1`,
      [deliveryId]
    );

    return {
      deliveryId: delivery.delivery_id,
      status: delivery.status,
      grpoDocNumber: delivery.grpo_doc_number,
      grpoPostedAt: delivery.grpo_posted_at,
      liabilityTs: delivery.liability_ts,
      lines: linesResult.rows.map(row => ({
        lineId: row.line_id,
        skuId: row.sku_id,
        qcStatus: row.qc_status,
        gkmStatus: row.gkm_status,
        gstStatus: row.gst_status
      }))
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Approve an over-delivery hold and retry SAP post
   */
  async approveOverDeliveryHold(holdId: string, userId: string, dcId: string, deviceId: string): Promise<void> {
    const client = await this.db.connect();
    let deliveryId: string;
    try {
      await client.query('BEGIN');

      const holdResult = await client.query(
        `UPDATE over_delivery_holds 
         SET status = 'Approved', approved_by = $1, approved_at = NOW() 
         WHERE hold_id = $2 AND status = 'Pending' 
         RETURNING delivery_id`,
        [userId, holdId]
      );

      if (holdResult.rows.length === 0) {
        throw new Error('Hold not found or already approved');
      }

      deliveryId = holdResult.rows[0].delivery_id;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Attempt to retry AutoGRN
    await this.initiateAutoGRN({
      deliveryId,
      dcId,
      userId,
      deviceId
    });
  }
}
