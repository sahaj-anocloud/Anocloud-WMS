-- add_scan_policy_columns.sql
-- Risk-Based Scanning Policy — schema additions
-- Requirements: 1.1, 2.1–2.7, 3.1, 4.1–4.6, 5.5, 9.2
--
-- This migration is idempotent: every ALTER TABLE uses IF NOT EXISTS so it can
-- be re-run safely against a database that already has some or all columns.

-- ─── delivery_lines — scan policy columns ────────────────────────────────────

-- scan_compliance_pct: MIN(100, FLOOR((completed_scans / required_scans) * 100))
-- Persisted at QC-pass time (Req 5.5, 9.1).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS scan_compliance_pct INTEGER;

-- override_applied: set to TRUE when a supervisor bypasses the hard stop (Req 6.5).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS override_applied BOOLEAN NOT NULL DEFAULT FALSE;

-- physical_count: total bag/unit count entered by QC worker for GunnyBag lines (Req 4.1).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS physical_count INTEGER;

-- unit_count: total unit count entered by QC worker for Loose lines (Req 4.4).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS unit_count INTEGER;

-- packaging_integrity_preserve: TRUE for ShrinkWrap — do not break packaging (Req 4.3).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS packaging_integrity_preserve BOOLEAN NOT NULL DEFAULT FALSE;

-- cold_routing_required: TRUE when SKU.requires_cold = true (Req 4.5).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS cold_routing_required BOOLEAN NOT NULL DEFAULT FALSE;

-- mixed_load_review: TRUE for MixedLoad lines requiring supervisor review (Req 2.6).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS mixed_load_review BOOLEAN NOT NULL DEFAULT FALSE;

-- label_affixing_required: TRUE for Rice lines where a Weight Label must be affixed (Req 4.2).
ALTER TABLE delivery_lines
  ADD COLUMN IF NOT EXISTS label_affixing_required BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── asns — confidence score column ──────────────────────────────────────────

-- asn_confidence_score: 0–100 score used by the policy engine to apply the
-- low-confidence 1.5× multiplier (Req 3.3).  Defaults to 100 (full confidence)
-- so existing rows are unaffected.
ALTER TABLE asns
  ADD COLUMN IF NOT EXISTS asn_confidence_score INTEGER DEFAULT 100;

-- ─── deliveries — aggregate compliance column ─────────────────────────────────

-- delivery_scan_compliance_pct: arithmetic mean of all line-level scan_compliance_pct
-- values, persisted when the delivery is closed (Req 9.2).
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS delivery_scan_compliance_pct INTEGER;
