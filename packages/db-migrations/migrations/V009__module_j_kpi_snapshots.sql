-- V009: Module J — Reporting / Dashboards / Control Tower
-- Tables: kpi_snapshots
-- KPIs are pre-aggregated every 5 minutes by a background worker.
-- Dashboard reads hit this table for sub-second load times (Req 18.2).

CREATE TABLE kpi_snapshots (
  snapshot_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id                    VARCHAR(20) NOT NULL,
  snapshot_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ASN Coverage Rate: ASNs submitted vs. deliveries received (target >80%)
  asn_coverage_rate        NUMERIC(5,2) NOT NULL
    CHECK (asn_coverage_rate BETWEEN 0 AND 100),

  -- Gate-to-GRN Time in minutes (target <60 clean, <90 with exceptions)
  gate_to_grn_time_avg_min NUMERIC(8,2),

  -- Dock Dwell Time for Perishables in minutes (target <30)
  perishable_dwell_avg_min NUMERIC(8,2),

  -- Receipt First-Pass Yield: lines passing QC on first attempt (target >85%)
  receipt_first_pass_yield NUMERIC(5,2) NOT NULL
    CHECK (receipt_first_pass_yield BETWEEN 0 AND 100),

  -- Barcode Remediation Rate: items requiring relabeling / total received (target <10%)
  barcode_remediation_rate NUMERIC(5,2) NOT NULL
    CHECK (barcode_remediation_rate BETWEEN 0 AND 100),

  -- Scanning Compliance Rate: scans via scanner vs. total scan events (target 100%)
  scanning_compliance_rate NUMERIC(5,2) NOT NULL
    CHECK (scanning_compliance_rate BETWEEN 0 AND 100),

  -- Batch/Expiry Capture Rate for FMCG_Food, BDF, Fresh (target 100%)
  batch_capture_rate       NUMERIC(5,2) NOT NULL
    CHECK (batch_capture_rate BETWEEN 0 AND 100),

  -- Inventory Accuracy WMS vs. SAP (target >98%)
  inventory_accuracy_rate  NUMERIC(5,2) NOT NULL
    CHECK (inventory_accuracy_rate BETWEEN 0 AND 100),

  -- Vendor Compliance Document Currency: vendors with all docs current (target 100%)
  vendor_compliance_rate   NUMERIC(5,2) NOT NULL
    CHECK (vendor_compliance_rate BETWEEN 0 AND 100),

  -- Raw counts used to compute the rates above
  total_deliveries         INTEGER NOT NULL DEFAULT 0,
  total_asns               INTEGER NOT NULL DEFAULT 0,
  total_lines_received     INTEGER NOT NULL DEFAULT 0,
  total_lines_first_pass   INTEGER NOT NULL DEFAULT 0,
  total_items_relabeled    INTEGER NOT NULL DEFAULT 0,
  total_items_received     INTEGER NOT NULL DEFAULT 0,
  total_batch_required     INTEGER NOT NULL DEFAULT 0,
  total_batch_captured     INTEGER NOT NULL DEFAULT 0,
  total_vendors_active     INTEGER NOT NULL DEFAULT 0,
  total_vendors_compliant  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_kpi_snapshots_dc_id_snapshot_at ON kpi_snapshots (dc_id, snapshot_at DESC);
