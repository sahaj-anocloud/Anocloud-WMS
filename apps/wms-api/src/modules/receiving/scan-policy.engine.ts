import type { Pool } from 'pg';

// ─── Packaging Class Types ────────────────────────────────────────────────────

export type PackagingClass =
  | 'SealedCarton'
  | 'GunnyBag'
  | 'Rice'
  | 'ShrinkWrap'
  | 'Loose'
  | 'MixedLoad';

export const VALID_PACKAGING_CLASSES = new Set<PackagingClass>([
  'SealedCarton',
  'GunnyBag',
  'Rice',
  'ShrinkWrap',
  'Loose',
  'MixedLoad',
]);

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PolicyResult {
  packaging_class: PackagingClass;
  base_scan_count: number;
  sampling_modifier: number;
  asn_confidence_multiplier: number;
  required_scans: number;
  physical_count_required: boolean;
  label_affixing_required: boolean;
  cold_routing_required: boolean;
  packaging_integrity_preserve: boolean;
  mixed_load_supervisor_review: boolean;
}

export interface ScanPolicyConfig {
  packaging_classes: Record<
    PackagingClass,
    {
      base_formula: string;
      physical_count_required: boolean;
      label_affixing_required: boolean;
      packaging_integrity_preserve: boolean;
    }
  >;
  low_confidence_threshold: number;
  low_confidence_multiplier: number;
}

// ─── Default Policy Config ────────────────────────────────────────────────────

export const DEFAULT_SCAN_POLICY_CONFIG: ScanPolicyConfig = {
  packaging_classes: {
    SealedCarton: {
      base_formula: 'MAX(1, CEIL(batch_size * 0.05))',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
    GunnyBag: {
      base_formula: '1',
      physical_count_required: true,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
    Rice: {
      base_formula: '1',
      physical_count_required: false,
      label_affixing_required: true,
      packaging_integrity_preserve: false,
    },
    ShrinkWrap: {
      base_formula: 'batch_size',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: true,
    },
    Loose: {
      base_formula: 'batch_size + 1',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
    MixedLoad: {
      base_formula: 'MAX(1, CEIL(batch_size * 0.05))',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
  },
  low_confidence_threshold: 60,
  low_confidence_multiplier: 1.5,
};

// ─── ScanPolicyEngine ─────────────────────────────────────────────────────────

export class ScanPolicyEngine {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
  ) {}

  /**
   * Pure function: calculates base scan count from packaging class and batch size.
   * Throws UNKNOWN_PACKAGING_CLASS for unrecognised classes.
   *
   * Formulas:
   *   SealedCarton: MAX(1, CEIL(batchSize * 0.05))
   *   GunnyBag:     1
   *   Rice:         1
   *   ShrinkWrap:   batchSize
   *   Loose:        batchSize + 1
   *   MixedLoad:    MAX(1, CEIL(batchSize * 0.05))  (same as SealedCarton)
   */
  calculateBaseCount(packagingClass: PackagingClass, batchSize: number): number {
    switch (packagingClass) {
      case 'SealedCarton':
      case 'MixedLoad':
        return Math.max(1, Math.ceil(batchSize * 0.05));
      case 'GunnyBag':
        return 1;
      case 'Rice':
        return 1;
      case 'ShrinkWrap':
        return batchSize;
      case 'Loose':
        return batchSize + 1;
      default: {
        // TypeScript exhaustiveness check — at runtime this handles truly unknown values
        const err = new Error(`UNKNOWN_PACKAGING_CLASS: ${packagingClass as string}`);
        (err as Error & { code: string }).code = 'UNKNOWN_PACKAGING_CLASS';
        throw err;
      }
    }
  }

  /**
   * Applies trust tier and low-confidence multipliers to a base count.
   * Returns CEIL(base × samplingModifier × confidenceMultiplier).
   * Guarantees result >= base.
   */
  applyMultipliers(
    base: number,
    samplingModifier: number,
    confidenceMultiplier: number,
  ): number {
    const result = Math.ceil(base * samplingModifier * confidenceMultiplier);
    return Math.max(result, base);
  }

  /**
   * Loads the ScanPolicyConfig for a DC from system_config.
   * Returns the default config if no custom config is stored.
   */
  async loadPolicyConfig(dcId: string): Promise<ScanPolicyConfig> {
    const result = await this.dbRead.query<{ param_value: string }>(
      `SELECT param_value FROM system_config WHERE dc_id = $1 AND param_key = 'packaging_class_scan_policy'`,
      [dcId],
    );

    if (result.rows.length === 0 || !result.rows[0]?.param_value) {
      return DEFAULT_SCAN_POLICY_CONFIG;
    }

    try {
      return JSON.parse(result.rows[0].param_value) as ScanPolicyConfig;
    } catch {
      return DEFAULT_SCAN_POLICY_CONFIG;
    }
  }

  /**
   * Computes the full policy result for a delivery line.
   * Reads packaging class from the line's SKU, trust tier from the vendor,
   * and ASN confidence from the ASN record.
   * Writes a SCAN_POLICY_APPLIED audit event.
   */
  async computePolicy(lineId: string, dcId: string): Promise<PolicyResult> {
    // Load line + SKU details
    const lineResult = await this.dbRead.query<{
      packaging_class: string;
      batch_size: number;
      requires_cold: boolean;
      vendor_id: string;
      asn_id: string;
    }>(
      `SELECT
         s.packaging_class,
         dl.required_scans AS batch_size,
         s.requires_cold,
         a.vendor_id,
         ye.asn_id
       FROM delivery_lines dl
       JOIN deliveries d ON dl.delivery_id = d.delivery_id
       JOIN yard_entries ye ON d.yard_entry_id = ye.entry_id
       JOIN asns a ON ye.asn_id = a.asn_id
       JOIN skus s ON dl.sku_id = s.sku_id
       WHERE dl.line_id = $1`,
      [lineId],
    );

    if (lineResult.rows.length === 0) {
      throw new Error(`LINE_NOT_FOUND: ${lineId}`);
    }

    const line = lineResult.rows[0]!;
    const packagingClass = line.packaging_class as PackagingClass;

    // Validate packaging class
    if (!VALID_PACKAGING_CLASSES.has(packagingClass)) {
      const err = new Error(`UNKNOWN_PACKAGING_CLASS: ${packagingClass}`);
      (err as Error & { code: string }).code = 'UNKNOWN_PACKAGING_CLASS';
      throw err;
    }

    // Load trust tier sampling modifier
    const tierResult = await this.dbRead.query<{ sampling_modifier: string }>(
      `SELECT vtt.sampling_modifier
       FROM vendors v
       JOIN vendor_trust_tiers vtt ON v.trust_tier_id = vtt.tier_id
       WHERE v.vendor_id = $1`,
      [line.vendor_id],
    );
    const samplingModifier =
      tierResult.rows.length > 0 ? parseFloat(tierResult.rows[0]!.sampling_modifier) : 1.0;

    // Load ASN confidence score
    const asnResult = await this.dbRead.query<{ asn_confidence_score: number }>(
      `SELECT asn_confidence_score FROM asns WHERE asn_id = $1`,
      [line.asn_id],
    );
    const asnConfidenceScore =
      asnResult.rows.length > 0 ? (asnResult.rows[0]!.asn_confidence_score ?? 100) : 100;

    // Load policy config for DC
    const config = await this.loadPolicyConfig(dcId);
    const confidenceMultiplier =
      asnConfidenceScore < config.low_confidence_threshold
        ? config.low_confidence_multiplier
        : 1.0;

    // Calculate counts
    const batchSize = line.batch_size ?? 0;
    const baseScanCount = this.calculateBaseCount(packagingClass, batchSize);
    const requiredScans = this.applyMultipliers(baseScanCount, samplingModifier, confidenceMultiplier);

    // Determine workflow flags from config
    const classConfig = config.packaging_classes[packagingClass];
    const physicalCountRequired = classConfig?.physical_count_required ?? false;
    const labelAffixingRequired = classConfig?.label_affixing_required ?? false;
    const packagingIntegrityPreserve = classConfig?.packaging_integrity_preserve ?? false;
    const coldRoutingRequired = line.requires_cold ?? false;
    const mixedLoadSupervisorReview = packagingClass === 'MixedLoad';

    // Write SCAN_POLICY_APPLIED audit event (non-blocking)
    this.db
      .query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
         VALUES ($1, 'SCAN_POLICY_APPLIED', 'system', 'system', $2, $3::jsonb, 'policy_init')`,
        [
          dcId,
          lineId,
          JSON.stringify({
            delivery_line_id: lineId,
            packaging_class: packagingClass,
            batch_size: batchSize,
            base_scan_count: baseScanCount,
            sampling_modifier: samplingModifier,
            asn_confidence_multiplier: confidenceMultiplier,
            required_scans: requiredScans,
          }),
        ],
      )
      .catch((err: unknown) => {
        console.error('SCAN_POLICY_APPLIED audit write failed (non-blocking):', err);
      });

    // Update delivery_lines.required_scans
    await this.db.query(
      `UPDATE delivery_lines
       SET required_scans = $1,
           cold_routing_required = $2,
           packaging_integrity_preserve = $3,
           label_affixing_required = $4,
           mixed_load_review = $5
       WHERE line_id = $6`,
      [
        requiredScans,
        coldRoutingRequired,
        packagingIntegrityPreserve,
        labelAffixingRequired,
        mixedLoadSupervisorReview,
        lineId,
      ],
    );

    return {
      packaging_class: packagingClass,
      base_scan_count: baseScanCount,
      sampling_modifier: samplingModifier,
      asn_confidence_multiplier: confidenceMultiplier,
      required_scans: requiredScans,
      physical_count_required: physicalCountRequired,
      label_affixing_required: labelAffixingRequired,
      cold_routing_required: coldRoutingRequired,
      packaging_integrity_preserve: packagingIntegrityPreserve,
      mixed_load_supervisor_review: mixedLoadSupervisorReview,
    };
  }

  /**
   * Returns the list of all packaging classes with their current scan rules for a DC.
   */
  async listPackagingClassRules(dcId: string): Promise<PolicyResult[]> {
    const config = await this.loadPolicyConfig(dcId);

    return Array.from(VALID_PACKAGING_CLASSES).map((packagingClass) => {
      const classConfig = config.packaging_classes[packagingClass];
      return {
        packaging_class: packagingClass,
        base_scan_count: 0, // placeholder — no batch size context here
        sampling_modifier: 1.0,
        asn_confidence_multiplier: 1.0,
        required_scans: 0,
        physical_count_required: classConfig?.physical_count_required ?? false,
        label_affixing_required: classConfig?.label_affixing_required ?? false,
        cold_routing_required: false,
        packaging_integrity_preserve: classConfig?.packaging_integrity_preserve ?? false,
        mixed_load_supervisor_review: packagingClass === 'MixedLoad',
      };
    });
  }
}
