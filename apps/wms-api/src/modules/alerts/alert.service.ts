import { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { NotificationService } from './notification.service.js';

// ─── Alert type definitions ───────────────────────────────────────────────────

export type AlertSeverity = 'Info' | 'Warning' | 'Critical';
export type AlertChannel = 'InApp' | 'SMS' | 'Email';

export interface AlertTypeConfig {
  severity: AlertSeverity;
  targetRoles: string[];
  escalationWindowMinutes: number;
  escalationTargetRoles: string[];
  channels: AlertChannel[];
}

// All ten alert types with their configs (Req 17.1–17.5)
export const ALERT_TYPE_CONFIGS: Record<string, AlertTypeConfig> = {
  VENDOR_DOC_EXPIRY: {
    severity: 'Warning',
    targetRoles: ['Admin_User', 'Inbound_Supervisor'],
    escalationWindowMinutes: 60,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'Email'],
  },
  GST_MISMATCH: {
    severity: 'Critical',
    targetRoles: ['Finance_User', 'Inbound_Supervisor'],
    escalationWindowMinutes: 30,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'SMS', 'Email'],
  },
  GKM_SOFT_STOP: {
    severity: 'Warning',
    targetRoles: ['Inbound_Supervisor'],
    escalationWindowMinutes: 60,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'Email'],
  },
  GKM_HARD_STOP: {
    severity: 'Critical',
    targetRoles: ['Finance_User', 'BnM_User'],
    escalationWindowMinutes: 15,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'SMS', 'Email'],
  },
  PERISHABLE_DWELL: {
    severity: 'Critical',
    targetRoles: ['Inbound_Supervisor', 'Dock_Manager'],
    escalationWindowMinutes: 15,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'SMS'],
  },
  QUARANTINE_OPEN_4H: {
    severity: 'Warning',
    targetRoles: ['Inbound_Supervisor', 'Finance_User'],
    escalationWindowMinutes: 60,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'Email'],
  },
  VEHICLE_DWELL_60M: {
    severity: 'Warning',
    targetRoles: ['Dock_Manager'],
    escalationWindowMinutes: 30,
    escalationTargetRoles: ['Inbound_Supervisor'],
    channels: ['InApp'],
  },
  SAP_SYNC_DISCREPANCY: {
    severity: 'Warning',
    targetRoles: ['Inventory_Controller', 'Finance_User'],
    escalationWindowMinutes: 120,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'Email'],
  },
  UNEXPECTED_ITEM: {
    severity: 'Warning',
    targetRoles: ['Inbound_Supervisor', 'WH_Associate'],
    escalationWindowMinutes: 30,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp'],
  },
  SAP_GRPO_FAILURE: {
    severity: 'Critical',
    targetRoles: ['Inbound_Supervisor', 'Finance_User'],
    escalationWindowMinutes: 15,
    escalationTargetRoles: ['SCM_Head', 'Admin_User'],
    channels: ['InApp', 'SMS', 'Email'],
  },
  VENDOR_PERFORMANCE_INCIDENT: {
    severity: 'Warning',
    targetRoles: ['Inbound_Supervisor', 'BnM_User'],
    escalationWindowMinutes: 120,
    escalationTargetRoles: ['SCM_Head', 'Admin_User'],
    channels: ['InApp', 'Email'],
  },
  PRODUCTIVITY_EXCEPTION: {
    severity: 'Warning',
    targetRoles: ['Inbound_Supervisor'],
    escalationWindowMinutes: 30,
    escalationTargetRoles: ['Admin_User'],
    channels: ['InApp', 'Email'],
  },
  ASN_OVER_DELIVERY: {
    severity: 'Warning',
    targetRoles: ['Inbound_Supervisor', 'Dock_Manager'], // Inbound Manager role check
    escalationWindowMinutes: 120,
    escalationTargetRoles: ['SCM_Head'],
    channels: ['InApp', 'Email'],
  },
};

export interface CreateAlertInput {
  dcId: string;
  alertType: string;
  referenceDoc?: string;
  payload: Record<string, unknown>;
  targetUserIds?: string[]; // If not provided, fan-out to all users in targetRoles
}

export interface AlertRow {
  alert_id: string;
  dc_id: string;
  alert_type: string;
  severity: string;
  reference_doc?: string;
  triggered_at: string;
  payload: Record<string, unknown>;
}

// ─── Alert Service ─────────────────────────────────────────────────────────────

export class AlertService {
  constructor(
    private readonly db: Pool,
    private readonly sqsClient: SQSClient,
    private readonly alertQueueUrl: string = process.env['SQS_ALERT_QUEUE_URL'] ?? '',
  ) {}

  /**
   * Creates an alert and fans out alert_deliveries records per target role.
   * Publishes to SQS Alert-Events queue.
   * Req 17.1–17.3
   */
  async createAlert(input: CreateAlertInput): Promise<AlertRow> {
    const config = ALERT_TYPE_CONFIGS[input.alertType];
    if (!config) {
      throw new Error(`Unknown alert_type: ${input.alertType}`);
    }

    const alertResult = await this.db.query<AlertRow>(
      `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, payload)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        input.dcId,
        input.alertType,
        config.severity,
        input.referenceDoc ?? null,
        JSON.stringify(input.payload),
      ],
    );

    const alert = alertResult.rows[0]!;

    // Fan-out: get all user IDs with any of the target roles
    let targetUserIds = input.targetUserIds ?? [];
    if (targetUserIds.length === 0) {
      const usersResult = await this.db.query<{ user_id: string }>(
        `SELECT DISTINCT ur.user_id
         FROM user_roles ur
         JOIN rbac_roles r ON r.role_id = ur.role_id
         WHERE r.role_name = ANY($1) AND ur.dc_id = $2`,
        [config.targetRoles, input.dcId],
      );
      targetUserIds = usersResult.rows.map((r) => r.user_id);
    }

    // Create delivery records for each user × channel
    for (const userId of targetUserIds) {
      for (const channel of config.channels) {
        await this.db.query(
          `INSERT INTO alert_deliveries (alert_id, target_user_id, channel, status)
           VALUES ($1,$2,$3,'Pending')`,
          [alert.alert_id, userId, channel],
        );
      }
    }

    // Publish to SQS for Consumer worker to actually send notifications
    if (this.alertQueueUrl) {
      try {
        await this.sqsClient.send(
          new SendMessageCommand({
            QueueUrl: this.alertQueueUrl,
            MessageBody: JSON.stringify({
              alert_id: alert.alert_id,
              alert_type: input.alertType,
              dc_id: input.dcId,
              severity: config.severity,
              reference_doc: input.referenceDoc,
              target_user_ids: targetUserIds,
              channels: config.channels,
              payload: input.payload,
            }),
          }),
        );
      } catch (sqsErr) {
        console.error('Failed to publish alert to SQS:', sqsErr);
      }
    }

    return alert;
  }

  /**
   * Records acknowledgement timestamp and user ID for an alert delivery.
   * Req 17.2
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update global alert record
      await client.query(
        `UPDATE alerts SET acknowledged_at = now(), acknowledged_by = $1 WHERE alert_id = $2`,
        [userId, alertId],
      );

      // Update delivery records for this user (if any)
      await client.query(
        `UPDATE alert_deliveries SET status = 'Acknowledged', acknowledged_at = now() 
         WHERE alert_id = $1 AND target_user_id = $2`,
        [alertId, userId],
      );

      // Write audit event
      await client.query(
        `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state)
         SELECT dc_id, 'ALERT_ACKNOWLEDGED', $1, 'system', $2, '{"status": "Acknowledged"}'
         FROM alerts WHERE alert_id = $2`,
        [userId, alertId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async escalateAlert(alertId: string, userId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update global alert record to Escalated
      await client.query(
        `UPDATE alerts SET severity = 'Critical' WHERE alert_id = $1`,
        [alertId],
      );

      // Mark all current deliveries as Escalated
      await client.query(
        `UPDATE alert_deliveries SET status = 'Escalated', escalated_at = now() 
         WHERE alert_id = $1`,
        [alertId],
      );

      // Write audit event
      await client.query(
        `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state)
         SELECT dc_id, 'ALERT_ESCALATED', $1, 'system', $2, '{"status": "Escalated", "forced": true}'
         FROM alerts WHERE alert_id = $2`,
        [userId, alertId],
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
   * Checks for unacknowledged alerts past their escalation window.
   * Creates new alert_deliveries records for escalation targets.
   * Called by escalation engine every 1 minute.
   * Req 17.4, 17.5
   */
  async runEscalations(): Promise<void> {
    // Find unacknowledged deliveries past escalation window
    const result = await this.db.query<{
      delivery_id: string;
      alert_id: string;
      alert_type: string;
      dc_id: string;
      triggered_at: string;
    }>(
      `SELECT ad.delivery_id, a.alert_id, a.alert_type, a.dc_id, a.triggered_at
       FROM alert_deliveries ad
       JOIN alerts a ON a.alert_id = ad.alert_id
       WHERE ad.status IN ('Pending','Sent')
         AND ad.escalated_at IS NULL`,
    );

    for (const row of result.rows) {
      const config = ALERT_TYPE_CONFIGS[row.alert_type];
      if (!config) continue;

      const triggeredAt = new Date(row.triggered_at);
      const elapsedMinutes = (Date.now() - triggeredAt.getTime()) / 60000;

      if (elapsedMinutes < config.escalationWindowMinutes) continue;

      // Mark as escalated
      await this.db.query(
        `UPDATE alert_deliveries SET escalated_at = now(), status = 'Escalated'
         WHERE delivery_id = $1`,
        [row.delivery_id],
      );

      // Get escalation target users
      const escalateUsersResult = await this.db.query<{ user_id: string }>(
        `SELECT DISTINCT ur.user_id FROM user_roles ur
         JOIN rbac_roles r ON r.role_id = ur.role_id
         WHERE r.role_name = ANY($1) AND ur.dc_id = $2`,
        [config.escalationTargetRoles, row.dc_id],
      );

      for (const u of escalateUsersResult.rows) {
        for (const channel of config.channels) {
          await this.db.query(
            `INSERT INTO alert_deliveries (alert_id, target_user_id, channel, status)
             VALUES ($1,$2,$3,'Pending')
             ON CONFLICT DO NOTHING`,
            [row.alert_id, u.user_id, channel],
          );
        }
      }
    }
  }

  /**
   * Returns alerts for a DC within an optional date range.
   */
  async listAlerts(
    dcId: string,
    filters: { alertType?: string; fromDate?: string; toDate?: string },
  ): Promise<AlertRow[]> {
    const conditions = ['a.dc_id = $1'];
    const params: unknown[] = [dcId];
    let idx = 2;

    if (filters.alertType) {
      conditions.push(`a.alert_type = $${idx++}`);
      params.push(filters.alertType);
    }
    if (filters.fromDate) {
      conditions.push(`a.triggered_at >= $${idx++}`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`a.triggered_at <= $${idx++}`);
      params.push(filters.toDate);
    }

    const result = await this.db.query<AlertRow>(
      `SELECT 
         a.*, 
         (a.acknowledged_at IS NOT NULL) as is_acknowledged 
       FROM alerts a 
       WHERE ${conditions.join(' AND ')} 
       ORDER BY triggered_at DESC LIMIT 200`,
      params,
    );

    return result.rows;
  }

  async listExceptions(dcId: string, limit: number = 50): Promise<any[]> {
    const sql = `
      -- GST Mismatches
      SELECT 
        gc.id::text as exception_id,
        'CommercialVariance' as type,
        'High' as severity,
        v.name as vendor_name,
        d.delivery_id::text as delivery_id,
        gc.checked_at::text as created_at,
        'Open' as status,
        'GST mismatch on ' || s.sku_code || ': ' || gc.actual_rate || '% (expected ' || gc.expected_rate || '%)' as description
      FROM gst_checks gc
      JOIN delivery_lines dl ON dl.line_id = gc.delivery_line_id
      JOIN deliveries d ON d.delivery_id = dl.delivery_id
      JOIN vendors v ON v.vendor_id = d.vendor_id
      JOIN skus s ON s.sku_id = dl.sku_id
      WHERE d.dc_id = $1 AND gc.is_mismatch = true

      UNION ALL

      -- GKM Violations
      SELECT 
        gk.id::text as exception_id,
        'GKMBreach' as type,
        'Critical' as severity,
        v.name as vendor_name,
        d.delivery_id::text as delivery_id,
        gk.checked_at::text as created_at,
        'Open' as status,
        'GKM ' || gk.tier || ': ' || gk.rule_name as description
      FROM gkm_checks gk
      JOIN delivery_lines dl ON dl.line_id = gk.delivery_line_id
      JOIN deliveries d ON d.delivery_id = dl.delivery_id
      JOIN vendors v ON v.vendor_id = d.vendor_id
      WHERE d.dc_id = $1 AND gk.tier IN ('SoftStop', 'HardStop')

      UNION ALL

      -- Over-delivery Holds
      SELECT 
        h.hold_id::text as exception_id,
        'OverDelivery' as type,
        'Medium' as severity,
        v.name as vendor_name,
        d.delivery_id::text as delivery_id,
        h.created_at::text as created_at,
        'Open' as status,
        'Over-delivery of ' || h.excess_qty || ' units' as description
      FROM over_delivery_holds h
      JOIN deliveries d ON d.delivery_id = h.delivery_id
      JOIN vendors v ON v.vendor_id = d.vendor_id
      WHERE d.dc_id = $1 AND h.status = 'Pending'

      UNION ALL

      -- Quarantine Holds
      SELECT 
        q.quarantine_id::text as exception_id,
        'Quarantine' as type,
        'Critical' as severity,
        '—' as vendor_name,
        '—' as delivery_id,
        q.created_at::text as created_at,
        'Open' as status,
        'Hold for ' || q.quantity || ' units: ' || q.reason_code as description
      FROM quarantine_records q
      WHERE q.dc_id = $1 AND q.status = 'Quarantined'

      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.db.query(sql, [dcId, limit]);
    return result.rows;
  }

  /**
   * Rolls up vendor performance exceptions. Item #323.
   */
  async runVendorPerformanceRollup(dcId: string): Promise<void> {
    // 1. Repeated no-slot arrivals (3 in 30 days)
    const noSlot = await this.db.query<{ vendor_id: string; count: string }>(
      `SELECT vendor_id, COUNT(*) as count FROM appointments 
       WHERE status = 'NoShow' AND slot_start > now() - INTERVAL '30 days' AND dc_id = $1
       GROUP BY vendor_id HAVING COUNT(*) >= 3`,
      [dcId]
    );
    for (const r of noSlot.rows) {
      await this.recordScorecardIncident(dcId, r.vendor_id, 'NoShow', parseInt(r.count, 10), 30);
    }

    // 2. Chronic quantity mismatch (3 in 30 days)
    const qtyMismatch = await this.db.query<{ vendor_id: string; count: string }>(
      `SELECT a.vendor_id, COUNT(*) as count FROM delivery_lines dl
       JOIN deliveries d ON d.delivery_id = dl.delivery_id
       JOIN asns a ON a.asn_id = d.asn_id
       WHERE dl.received_qty != dl.expected_qty AND d.created_at > now() - INTERVAL '30 days' AND d.dc_id = $1
       GROUP BY a.vendor_id HAVING COUNT(*) >= 3`,
      [dcId]
    );
    for (const r of qtyMismatch.rows) {
      await this.recordScorecardIncident(dcId, r.vendor_id, 'QtyMismatch', parseInt(r.count, 10), 30);
    }

    // 3. Duplicate ASN submissions
    const dupASN = await this.db.query<{ vendor_id: string; po_id: string; count: string }>(
      `SELECT vendor_id, po_id, COUNT(*) as count FROM asns 
       WHERE dc_id = $1 AND submitted_at > now() - INTERVAL '24 hours'
       GROUP BY vendor_id, po_id HAVING COUNT(*) > 1`,
      [dcId]
    );
    for (const r of dupASN.rows) {
      await this.recordScorecardIncident(dcId, r.vendor_id, 'DuplicateASN', parseInt(r.count, 10), 1);
    }

    // 4. Wrong-day / Ad-hoc arrivals (Item #218)
    const wrongDay = await this.db.query<{ vendor_id: string; count: string }>(
      `SELECT vendor_id, COUNT(*) as count FROM yard_entries 
       WHERE status = 'Unscheduled' AND gate_in_at > now() - INTERVAL '30 days' AND dc_id = $1
       GROUP BY vendor_id HAVING COUNT(*) >= 3`,
      [dcId]
    );
    for (const r of wrongDay.rows) {
      await this.recordScorecardIncident(dcId, r.vendor_id, 'WrongDayArrival', parseInt(r.count, 10), 30);
    }
  }

  /**
   * Productivity alerts for scan lag and device failures. Item #322.
   */
  async runProductivityAlerts(dcId: string): Promise<void> {
    // Unusual scan completion lag (>2x average)
    // Simplified: Find lines where loading/receiving took > 2 hours
    const lagResult = await this.db.query<{ line_id: string; duration_min: string }>(
      `SELECT line_id, EXTRACT(EPOCH FROM (updated_at - created_at))/60 as duration_min 
       FROM delivery_lines WHERE qc_status = 'Passed' AND updated_at > now() - INTERVAL '1 hour'
       AND EXTRACT(EPOCH FROM (updated_at - created_at))/60 > 120`,
      []
    );
    for (const r of lagResult.rows) {
      await this.createAlert({
        dcId,
        alertType: 'PRODUCTIVITY_EXCEPTION',
        payload: { line_id: r.line_id, reason: 'Excessive Scan Lag', duration_min: r.duration_min }
      });
    }
  }

  private async recordScorecardIncident(dcId: string, vendorId: string, type: string, count: number, period: number): Promise<void> {
    await this.db.query(
      `INSERT INTO scorecard_incidents (dc_id, vendor_id, incident_type, count, period_days)
       VALUES ($1, $2, $3, $4, $5)`,
      [dcId, vendorId, type, count, period]
    );

    await this.createAlert({
      dcId,
      alertType: 'VENDOR_PERFORMANCE_INCIDENT',
      payload: { vendor_id: vendorId, incident_type: type, count, period_days: period }
    });
  }

  /**
   * Delivers pending alerts via WhatsApp/Email. Item #167.
   */
  async processDeliveries(): Promise<void> {
    const result = await this.db.query<{
      delivery_id: string;
      target_user_id: string;
      channel: string;
      dc_id: string;
      alert_type: string;
      payload: any;
    }>(
      `SELECT ad.delivery_id, ad.target_user_id, ad.channel, a.dc_id, a.alert_type, a.payload
       FROM alert_deliveries ad
       JOIN alerts a ON a.alert_id = ad.alert_id
       WHERE ad.status = 'Pending' LIMIT 100`
    );

    const notifier = new NotificationService(this.db);

    for (const d of result.rows) {
      try {
        let sent = false;
        if (d.channel === 'Email') {
          const user = await this.db.query<{ email: string }>('SELECT email FROM user_profiles WHERE user_id = $1', [d.target_user_id]);
          if (user.rows[0]?.email) {
            await notifier.sendEmail(user.rows[0].email, `WMS Alert: ${d.alert_type}`, JSON.stringify(d.payload), d.dc_id);
            sent = true;
          }
        } else if (d.channel === 'SMS') {
          const user = await this.db.query<{ phone: string }>('SELECT phone FROM user_profiles WHERE user_id = $1', [d.target_user_id]);
          if (user.rows[0]?.phone) {
            await notifier.sendWhatsApp(user.rows[0].phone, `[WMS] ${d.alert_type}: ${JSON.stringify(d.payload)}`, d.dc_id);
            sent = true;
          }
        }

        // WhatsApp for Vendors (Item #167)
        if (d.alert_type.startsWith('VENDOR_') && d.payload.vendor_id) {
          const vendor = await this.db.query<{ contact_phone: string }>('SELECT contact_phone FROM vendors WHERE vendor_id = $1', [d.payload.vendor_id]);
          if (vendor.rows[0]?.contact_phone) {
            await notifier.sendWhatsApp(vendor.rows[0].contact_phone, `[SumoSave Vendor Portal] Alert: ${d.alert_type}`, d.dc_id);
          }
        }

        await this.db.query(`UPDATE alert_deliveries SET status = 'Sent', sent_at = now() WHERE delivery_id = $1`, [d.delivery_id]);
      } catch (err) {
        console.error(`Failed to deliver alert ${d.delivery_id}:`, err);
      }
    }
  }
}
