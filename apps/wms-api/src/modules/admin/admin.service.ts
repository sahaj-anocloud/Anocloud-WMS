import { Pool } from 'pg';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SystemConfigRow {
  config_id: string;
  dc_id: string;
  param_key: string;
  param_value: string;
  updated_by: string;
  updated_at: string;
  reason_code: string;
}

// Supported configurable parameter keys (Req 19.3)
export const VALID_CONFIG_KEYS = new Set([
  'gkm_auto_accept_pct',
  'gkm_soft_stop_pct',
  'alert_escalation_minutes',
  'dock_capacity_per_slot',
  'vendor_delivery_schedule',
  'packaging_class_scan_policy',
  'mandatory_attributes_fmcg_food',
  'mandatory_attributes_bdf',
  'mandatory_attributes_fresh',
  'mandatory_attributes_chocolate',
  'language_preference',
  'perishable_dwell_limit_minutes',
  'quarantine_alert_hours',
  'sap_sync_interval_minutes',
  'kpi_snapshot_interval_minutes',
]);

// ─── Admin Service ────────────────────────────────────────────────────────────

export class AdminService {
  constructor(private readonly db: Pool) {}

  /**
   * Returns all system config entries for a DC.
   * dc_id is injected from JWT claims — multi-DC isolation enforced. Req 19.5
   */
  async getConfig(dcId: string): Promise<SystemConfigRow[]> {
    const result = await this.db.query<SystemConfigRow>(
      `SELECT * FROM system_config WHERE dc_id = $1 ORDER BY param_key`,
      [dcId],
    );
    return result.rows;
  }

  /**
   * Updates a single config parameter.
   * Records previous value, new value, Admin_User ID, timestamp, reason_code in audit_events.
   * dc_id is from JWT — DC-B config is never affected by DC-A updates. Req 19.3–19.5
   */
  async updateConfig(
    dcId: string,
    paramKey: string,
    paramValue: string,
    reasonCode: string,
    updatedBy: string,
    deviceId: string,
  ): Promise<SystemConfigRow> {
    if (!VALID_CONFIG_KEYS.has(paramKey)) {
      throw Object.assign(
        new Error(`INVALID_CONFIG_KEY: ${paramKey}`),
        { code: 'INVALID_CONFIG_KEY' },
      );
    }

    // Fetch previous value for audit trail
    const prevResult = await this.db.query<{ param_value: string }>(
      `SELECT param_value FROM system_config WHERE dc_id = $1 AND param_key = $2`,
      [dcId, paramKey],
    );

    const previousValue = prevResult.rows[0]?.param_value ?? null;

    // Upsert the config entry
    const result = await this.db.query<SystemConfigRow>(
      `INSERT INTO system_config (dc_id, param_key, param_value, updated_by, reason_code)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (dc_id, param_key) DO UPDATE
         SET param_value = EXCLUDED.param_value,
             updated_by  = EXCLUDED.updated_by,
             updated_at  = now(),
             reason_code = EXCLUDED.reason_code
       RETURNING *`,
      [dcId, paramKey, paramValue, updatedBy, reasonCode],
    );

    // Write audit event with previous and new values. Req 19.4
    await writeAuditEvent(this.db, {
      dc_id: dcId,
      event_type: 'CONFIG_UPDATED',
      user_id: updatedBy,
      device_id: deviceId,
      reference_doc: paramKey,
      previous_state: { param_value: previousValue },
      new_state: { param_value: paramValue },
      reason_code: reasonCode,
    });

    return result.rows[0]!;
  }

  /**
   * Retrieves a single config parameter value for a DC.
   * Returns null if not configured (caller uses system default).
   * Enforces DC isolation via dc_id scoping.
   */
  async getParam(dcId: string, paramKey: string): Promise<string | null> {
    const result = await this.db.query<{ param_value: string }>(
      `SELECT param_value FROM system_config WHERE dc_id = $1 AND param_key = $2`,
      [dcId, paramKey],
    );
    return result.rows[0]?.param_value ?? null;
  }

  async getDockZones(dcId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM dock_zones WHERE dc_id = $1 ORDER BY zone_id`,
      [dcId],
    );
    return result.rows;
  }
}
