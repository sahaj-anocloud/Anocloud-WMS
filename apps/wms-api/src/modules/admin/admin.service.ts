import { Pool } from 'pg';
import { writeAuditEvent } from '../../plugins/audit.js';
import {
  ScanPolicyConfig,
  DEFAULT_SCAN_POLICY_CONFIG,
} from '../receiving/scan-policy.engine.js';

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

// ─── Scan Policy Types ────────────────────────────────────────────────────────

export interface ComplianceSummaryRow {
  vendor_id: string;
  vendor_name: string;
  delivery_count: number;
  override_count: number;
  avg_scan_compliance_pct: number;
}

/**
 * Pure helper: returns true iff the modifier is within the allowed range [0.5, 5.0].
 * Exported for property-based testing.
 */
export function isValidModifier(modifier: number): boolean {
  return modifier >= 0.5 && modifier <= 5.0;
}

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

  /**
   * Returns the scan policy config for a DC.
   * Falls back to DEFAULT_SCAN_POLICY_CONFIG when no row exists in system_config.
   * Req 8.1, 8.5
   */
  async getScanPolicy(dcId: string): Promise<ScanPolicyConfig> {
    const raw = await this.getParam(dcId, 'packaging_class_scan_policy');
    if (!raw) {
      return DEFAULT_SCAN_POLICY_CONFIG;
    }
    try {
      return JSON.parse(raw) as ScanPolicyConfig;
    } catch {
      return DEFAULT_SCAN_POLICY_CONFIG;
    }
  }

  /**
   * Validates and persists a new scan policy for a DC.
   * Rejects any sampling_modifier outside [0.5, 5.0] with INVALID_MODIFIER_RANGE.
   * Writes a CONFIG_UPDATED audit event with previous and new policy values.
   * Req 8.2–8.6
   */
  async updateScanPolicy(
    dcId: string,
    policy: ScanPolicyConfig,
    reasonCode: string,
    updatedBy: string,
    deviceId: string,
  ): Promise<ScanPolicyConfig> {
    // Validate all sampling_modifier values in the policy
    // The policy's packaging_classes record may carry per-class modifiers in
    // extended usage; the trust-tier modifiers are stored on vendor_trust_tiers.
    // For the admin update path we validate any numeric field named
    // sampling_modifier that appears at the top level of each class config.
    // Per the design, the modifier range check applies to values submitted
    // through this endpoint (Req 8.2, 8.6).
    for (const [cls, classConfig] of Object.entries(policy.packaging_classes)) {
      const cfg = classConfig as Record<string, unknown>;
      if ('sampling_modifier' in cfg) {
        const mod = cfg['sampling_modifier'] as number;
        if (!isValidModifier(mod)) {
          throw Object.assign(
            new Error(`INVALID_MODIFIER_RANGE: sampling_modifier for ${cls} is ${mod}`),
            { code: 'INVALID_MODIFIER_RANGE' },
          );
        }
      }
    }

    // Also validate low_confidence_multiplier if it acts as a modifier
    // (it is a multiplier, not a sampling_modifier, so we skip it here)

    const serialised = JSON.stringify(policy);
    await this.updateConfig(dcId, 'packaging_class_scan_policy', serialised, reasonCode, updatedBy, deviceId);

    return policy;
  }

  /**
   * Returns a per-vendor compliance summary for a DC over a date range.
   * Aggregates delivery count, override count, and average scan_compliance_pct.
   * Req 9.3, 9.5
   */
  async getComplianceSummary(
    dcId: string,
    fromDate: string,
    toDate: string,
  ): Promise<ComplianceSummaryRow[]> {
    const result = await this.db.query<ComplianceSummaryRow>(
      `SELECT
         v.vendor_id,
         v.vendor_name,
         COUNT(DISTINCT d.delivery_id)::integer                          AS delivery_count,
         COUNT(dl.line_id) FILTER (WHERE dl.override_applied = true)::integer AS override_count,
         COALESCE(AVG(dl.scan_compliance_pct), 0)::float                AS avg_scan_compliance_pct
       FROM deliveries d
       JOIN delivery_lines dl ON dl.delivery_id = d.delivery_id
       JOIN yard_entries ye   ON d.yard_entry_id = ye.entry_id
       JOIN asns a            ON ye.asn_id = a.asn_id
       JOIN vendors v         ON a.vendor_id = v.vendor_id
       WHERE d.dc_id = $1
         AND d.created_at >= $2
         AND d.created_at <  $3
       GROUP BY v.vendor_id, v.vendor_name
       ORDER BY v.vendor_name`,
      [dcId, fromDate, toDate],
    );
    return result.rows;
  }
}
