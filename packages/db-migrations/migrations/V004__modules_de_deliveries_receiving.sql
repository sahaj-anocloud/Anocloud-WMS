-- V004: Modules D/E — Deliveries, Receiving, GKM, GST
-- Tables: deliveries, delivery_lines, scan_events, gkm_checks, gst_checks

-- ─── Deliveries ───────────────────────────────────────────────────────────────

CREATE TABLE deliveries (
  delivery_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id           VARCHAR(20) NOT NULL,
  asn_id          UUID NOT NULL REFERENCES asns(asn_id),
  yard_entry_id   UUID NOT NULL REFERENCES yard_entries(entry_id),
  status          VARCHAR(30) NOT NULL DEFAULT 'Unloading'
    CHECK (status IN ('Unloading','QCInProgress','PendingGRN','GRNInProgress','GRNComplete','Rejected')),
  grpo_doc_number VARCHAR(50),
  grpo_posted_at  TIMESTAMPTZ,
  liability_ts    TIMESTAMPTZ,  -- BR-19: set equal to grpo_posted_at
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_dc_id ON deliveries (dc_id);
CREATE INDEX idx_deliveries_asn_id ON deliveries (asn_id);
CREATE INDEX idx_deliveries_yard_entry_id ON deliveries (yard_entry_id);
CREATE INDEX idx_deliveries_status ON deliveries (status);

-- ─── Delivery Lines ───────────────────────────────────────────────────────────

CREATE TABLE delivery_lines (
  line_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id     UUID NOT NULL REFERENCES deliveries(delivery_id),
  po_line_id      UUID NOT NULL REFERENCES po_lines(po_line_id),
  sku_id          UUID NOT NULL REFERENCES skus(sku_id),
  expected_qty    NUMERIC(12,3) NOT NULL,
  received_qty    NUMERIC(12,3) NOT NULL DEFAULT 0,
  packaging_class VARCHAR(30) NOT NULL,
  required_scans  INTEGER NOT NULL,  -- computed from BR-07
  completed_scans INTEGER NOT NULL DEFAULT 0,
  batch_number    VARCHAR(100),
  expiry_date     DATE,
  qc_status       VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (qc_status IN ('Pending','InProgress','Passed','Failed','Blocked')),
  gkm_status      VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (gkm_status IN ('Pending','AutoAccepted','SoftStop','HardStop','Approved')),
  gst_status      VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (gst_status IN ('Pending','Matched','Mismatch','Resolved')),
  staging_lane    VARCHAR(20),  -- FT | NFT | ColdZone | Unexpected
  promo_type      VARCHAR(20)   -- Case1 | Case2 | Case3 | null
);

CREATE INDEX idx_delivery_lines_delivery_id ON delivery_lines (delivery_id);
CREATE INDEX idx_delivery_lines_po_line_id ON delivery_lines (po_line_id);
CREATE INDEX idx_delivery_lines_sku_id ON delivery_lines (sku_id);
CREATE INDEX idx_delivery_lines_qc_status ON delivery_lines (qc_status);
CREATE INDEX idx_delivery_lines_gkm_status ON delivery_lines (gkm_status);
CREATE INDEX idx_delivery_lines_gst_status ON delivery_lines (gst_status);

-- ─── Scan Events ──────────────────────────────────────────────────────────────

CREATE TABLE scan_events (
  scan_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_line_id UUID NOT NULL REFERENCES delivery_lines(line_id),
  barcode          VARCHAR(100) NOT NULL,
  scan_result      VARCHAR(20) NOT NULL
    CHECK (scan_result IN ('Match','Mismatch','Unexpected')),
  scanned_by       UUID NOT NULL,
  device_id        VARCHAR(100) NOT NULL,
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_events_delivery_line_id ON scan_events (delivery_line_id);
CREATE INDEX idx_scan_events_scanned_at ON scan_events (scanned_at);
CREATE INDEX idx_scan_events_barcode ON scan_events (barcode);

-- ─── GKM Checks ───────────────────────────────────────────────────────────────

CREATE TABLE gkm_checks (
  check_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_line_id   UUID NOT NULL REFERENCES delivery_lines(line_id),
  po_unit_price      NUMERIC(12,4) NOT NULL,
  invoice_unit_price NUMERIC(12,4) NOT NULL,
  variance_pct       NUMERIC(8,4) NOT NULL,
  tier               VARCHAR(20) NOT NULL
    CHECK (tier IN ('AutoAccept','SoftStop','HardStop')),
  approver_id        UUID,
  approved_at        TIMESTAMPTZ,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gkm_checks_delivery_line_id ON gkm_checks (delivery_line_id);
CREATE INDEX idx_gkm_checks_tier ON gkm_checks (tier);

-- ─── GST Checks ───────────────────────────────────────────────────────────────

CREATE TABLE gst_checks (
  check_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_line_id UUID NOT NULL REFERENCES delivery_lines(line_id),
  sap_gst_rate     NUMERIC(5,2) NOT NULL,
  invoice_gst_rate NUMERIC(5,2) NOT NULL,
  is_mismatch      BOOLEAN NOT NULL,
  resolved_by      UUID,
  resolved_at      TIMESTAMPTZ,
  resolution_code  VARCHAR(100),
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gst_checks_delivery_line_id ON gst_checks (delivery_line_id);
CREATE INDEX idx_gst_checks_is_mismatch ON gst_checks (is_mismatch);
