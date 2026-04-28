-- V016__kpi_gaps_and_commercial_trends.sql

BEGIN;

-- Add missing KPI columns to kpi_snapshots
ALTER TABLE kpi_snapshots 
ADD COLUMN quarantine_cycle_time_avg_min NUMERIC(8,2),
ADD COLUMN asn_completeness_rate NUMERIC(5,2) DEFAULT 100 CHECK (asn_completeness_rate BETWEEN 0 AND 100);

-- Add data_completeness to asns table
ALTER TABLE asns ADD COLUMN data_completeness NUMERIC(3,2) DEFAULT 1.00 CHECK (data_completeness BETWEEN 0 AND 1);

-- Commercial Variance Trends table
CREATE TABLE commercial_variance_trends (
  trend_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   DATE NOT NULL,
  dc_id           VARCHAR(20) NOT NULL,
  mismatch_type   TEXT NOT NULL, -- 'GST', 'Cost', 'GKM', 'MRP', 'Promo'
  mismatch_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(snapshot_date, dc_id, mismatch_type)
);

CREATE INDEX idx_commercial_variance_trends_dc_date ON commercial_variance_trends (dc_id, snapshot_date DESC);

-- Scorecard Incidents for Vendor Rollup
CREATE TABLE scorecard_incidents (
  incident_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         VARCHAR(20) NOT NULL,
  vendor_id     UUID NOT NULL REFERENCES vendors(vendor_id),
  incident_type TEXT NOT NULL, -- 'NoShow', 'MissingBarcode', 'QtyMismatch', 'DuplicateASN'
  count         INTEGER NOT NULL,
  period_days   INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scorecard_incidents_vendor ON scorecard_incidents (vendor_id, created_at DESC);

-- Printers table for failover
CREATE TABLE printers (
  printer_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         VARCHAR(20) NOT NULL,
  dock_cluster  TEXT NOT NULL,
  host          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Online' CHECK (status IN ('Online','Offline','Maintenance')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Barcode Print Events (for reroute logging)
CREATE TABLE barcode_print_events (
  event_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         VARCHAR(20) NOT NULL,
  lpn_barcode   TEXT NOT NULL,
  original_host TEXT,
  actual_host   TEXT NOT NULL,
  status        TEXT NOT NULL, -- 'Success', 'Failed'
  reason_code   TEXT, -- 'PRINTER_FAILOVER', etc.
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_barcode_print_events_lpn ON barcode_print_events (lpn_barcode);

-- ASN Lines for quantity variance check
CREATE TABLE asn_lines (
  asn_line_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asn_id       UUID NOT NULL REFERENCES asns(asn_id),
  sku_id       UUID NOT NULL REFERENCES skus(sku_id),
  quantity     NUMERIC(12,3) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_asn_lines_asn ON asn_lines (asn_id);

-- Dwell Timer Continuity (Item #147)
ALTER TABLE quarantine_records ADD COLUMN entry_id UUID REFERENCES yard_entries(entry_id);

-- Notifications & Language (Item #167, #311)
CREATE TABLE user_profiles (
  user_id      UUID PRIMARY KEY,
  full_name    TEXT,
  email        TEXT,
  phone        TEXT,
  preferred_language TEXT DEFAULT 'en', -- Item #311: Hindi support
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vendors ADD COLUMN contact_email TEXT;
ALTER TABLE vendors ADD COLUMN contact_phone TEXT;

-- Line Status for UAT T-2.4
ALTER TABLE delivery_lines ADD COLUMN status VARCHAR(20) DEFAULT 'Open';

COMMIT;
