import { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { QuarantineService } from '../quarantine/quarantine.service.js';

export interface GSTCheckRequest {
  deliveryLineId: string;
  invoiceGstRate: number;
  dcId: string;
  userId: string;
  deviceId: string;
}

export interface GSTCheckResult {
  checkId: string;
  deliveryLineId: string;
  sapGstRate: number;
  invoiceGstRate: number;
  isMismatch: boolean;
  checkedAt: Date;
}

export interface GSTResolveRequest {
  checkId: string;
  resolverId: string;
  resolverRole: string; // Item #9.1
  deviceId: string;
  resolutionCode: string;
}

export class GSTService {
  private readonly quarantineService: QuarantineService;

  constructor(
    private db: Pool,
    sqsClient: SQSClient,
    alertQueueUrl?: string,
  ) {
    this.quarantineService = new QuarantineService(db, sqsClient, alertQueueUrl);
  }

  /**
   * Run GST check for a delivery line
   * Compares invoice GST rate against SAP master GST rate
   */
  async runGSTCheck(request: GSTCheckRequest): Promise<GSTCheckResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get SAP master GST rate for the SKU
      const lineResult = await client.query(
        `SELECT dl.line_id, dl.delivery_id, dl.sku_id, s.gst_rate as sap_gst_rate
         FROM delivery_lines dl
         JOIN skus s ON dl.sku_id = s.sku_id
         WHERE dl.line_id = $1 AND dl.delivery_id IN (
           SELECT delivery_id FROM deliveries WHERE dc_id = $2
         )`,
        [request.deliveryLineId, request.dcId]
      );

      if (lineResult.rows.length === 0) {
        throw new Error('Delivery line not found or access denied');
      }

      const { sap_gst_rate } = lineResult.rows[0];
      const isMismatch = parseFloat(sap_gst_rate) !== request.invoiceGstRate;

      // Insert gst_checks record
      const checkResult = await client.query(
        `INSERT INTO gst_checks (
          delivery_line_id, sap_gst_rate, invoice_gst_rate, 
          is_mismatch, checked_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING check_id, delivery_line_id, sap_gst_rate, 
                  invoice_gst_rate, is_mismatch, checked_at`,
        [request.deliveryLineId, sap_gst_rate, request.invoiceGstRate, isMismatch]
      );

      const check = checkResult.rows[0];

      // Update delivery_lines.gst_status
      const gstStatus = isMismatch ? 'Mismatch' : 'Matched';
      await client.query(
        `UPDATE delivery_lines SET gst_status = $1 WHERE line_id = $2`,
        [gstStatus, request.deliveryLineId]
      );

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          request.dcId,
          'GST_CHECK',
          request.userId,
          request.deviceId,
          check.check_id,
          JSON.stringify({
            isMismatch: isMismatch,
            sapGstRate: parseFloat(sap_gst_rate),
            invoiceGstRate: request.invoiceGstRate
          }),
          `GST check performed: ${gstStatus}`
        ]
      );

      // If mismatch, send alerts to Finance_User and Inbound_Supervisor
      if (isMismatch) {
        await this.publishAlert(client, {
          dcId: request.dcId,
          alertType: 'GST_MISMATCH',
          severity: 'Critical',
          referenceDoc: check.check_id,
          payload: {
            deliveryLineId: request.deliveryLineId,
            sapGstRate: parseFloat(sap_gst_rate),
            invoiceGstRate: request.invoiceGstRate
          }
        });

        // Gap #4 — BR-08 + BR-09:
        // Query SKU perishable flags, then place in cold quarantine.
        const skuResult = await client.query<{ is_perishable: boolean; requires_cold: boolean; sku_id: string }>(
          `SELECT s.is_perishable, s.requires_cold, s.sku_id
           FROM delivery_lines dl
           JOIN skus s ON dl.sku_id = s.sku_id
           WHERE dl.line_id = $1`,
          [request.deliveryLineId]
        );

        if (skuResult.rows.length > 0 && (skuResult.rows[0]!.is_perishable || skuResult.rows[0]!.requires_cold)) {
          // Commit the GST check first, then quarantine in its own transaction
          // (quarantine uses its own client internally)
          await client.query('COMMIT');

          try {
            await this.quarantineService.placeQuarantine({
              dcId: request.dcId,
              skuId: lineResult.rows[0]!.sku_id,
              quantity: 0, // physical hold — quantity reconciled from delivery_lines
              reasonCode: 'GST_MISMATCH_PERISHABLE_COLD_HOLD',
              userId: request.userId,
              deviceId: request.deviceId,
              isPerishable: true,   // BR-14: routes to ColdZone not QuarantineZone
            });
          } catch (quarantineErr: any) {
            // Do NOT re-throw: the GST check is already committed and the
            // gst_status is Mismatch which blocks GRN. Log separately so
            // ops team is alerted even if quarantine fails.
            await this.db.query(
              `INSERT INTO audit_events
                 (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
               VALUES ($1,'GST_MISMATCH_QUARANTINE_FAILED',$2,$3,$4,$5::jsonb,'quarantine_error')`,
              [
                request.dcId,
                request.userId,
                request.deviceId,
                check.check_id,
                JSON.stringify({ error: quarantineErr.message, sku_id: lineResult.rows[0]!.sku_id }),
              ]
            );
          }

          return {
            checkId: check.check_id,
            deliveryLineId: check.delivery_line_id,
            sapGstRate: parseFloat(check.sap_gst_rate),
            invoiceGstRate: parseFloat(check.invoice_gst_rate),
            isMismatch: check.is_mismatch,
            checkedAt: check.checked_at,
          };
        }
      }

      await client.query('COMMIT');

      return {
        checkId: check.check_id,
        deliveryLineId: check.delivery_line_id,
        sapGstRate: parseFloat(check.sap_gst_rate),
        invoiceGstRate: parseFloat(check.invoice_gst_rate),
        isMismatch: check.is_mismatch,
        checkedAt: check.checked_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolve a GST mismatch (Finance_User only)
   * Records resolution action before releasing line
   */
  async resolveGSTMismatch(request: GSTResolveRequest): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get check details
      const checkResult = await client.query(
        `SELECT gc.check_id, gc.delivery_line_id, gc.is_mismatch,
                dl.delivery_id, d.dc_id
         FROM gst_checks gc
         JOIN delivery_lines dl ON gc.delivery_line_id = dl.line_id
         JOIN deliveries d ON dl.delivery_id = d.delivery_id
         WHERE gc.check_id = $1`,
        [request.checkId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('GST check not found');
      }

      const check = checkResult.rows[0];

      if (!check.is_mismatch) {
        throw new Error('Cannot resolve a GST check that is not a mismatch');
      }

      // Role-based block (Item 9.1)
      if (!['Finance_User', 'SCM_Head'].includes(request.resolverRole)) {
        throw new Error('UNAUTHORIZED_ACCESS: Only Finance_User or SCM_Head can resolve GST mismatches');
      }

      // Update gst_checks with resolver
      await client.query(
        `UPDATE gst_checks 
         SET resolved_by = $1, resolved_at = NOW(), resolution_code = $2
         WHERE check_id = $3`,
        [request.resolverId, request.resolutionCode, request.checkId]
      );

      // Update delivery_lines.gst_status to Resolved
      await client.query(
        `UPDATE delivery_lines SET gst_status = 'Resolved' WHERE line_id = $1`,
        [check.delivery_line_id]
      );

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          check.dc_id,
          'GST_RESOLUTION',
          request.resolverId,
          request.deviceId,
          request.checkId,
          JSON.stringify({
            deliveryLineId: check.delivery_line_id,
            resolutionCode: request.resolutionCode
          }),
          `GST mismatch resolved: ${request.resolutionCode}`
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
   * Publish alert to SQS (simplified for now)
   */
  private async publishAlert(client: any, alert: {
    dcId: string;
    alertType: string;
    severity: string;
    referenceDoc: string;
    payload: any;
  }): Promise<void> {
    await client.query(
      `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, triggered_at, payload)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [alert.dcId, alert.alertType, alert.severity, alert.referenceDoc, JSON.stringify(alert.payload)]
    );
  }
}
