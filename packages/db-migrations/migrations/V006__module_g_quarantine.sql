-- V006: Module G — Quarantine / Hold / Damage Management
-- Tables: quarantine_records

CREATE TABLE quarantine_records (
  quarantine_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id             VARCHAR(20) NOT NULL,
  sku_id            UUID NOT NULL REFERENCES skus(sku_id),
  lpn_id            UUID REFERENCES lpns(lpn_id),
  quantity          NUMERIC(12,3) NOT NULL,
  reason_code       VARCHAR(100) NOT NULL,
  physical_location VARCHAR(50),   -- ColdZone | QuarantineZone
  financial_status  VARCHAR(20) NOT NULL DEFAULT 'Held'
    CHECK (financial_status IN ('Held','Released','Rejected','Disposed')),
  placed_by         UUID NOT NULL,
  placed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by       UUID,
  resolved_at       TIMESTAMPTZ,
  resolution        VARCHAR(20) CHECK (resolution IN ('Accept','Reject','Dispose'))
);

CREATE INDEX idx_quarantine_records_dc_id ON quarantine_records (dc_id);
CREATE INDEX idx_quarantine_records_sku_id ON quarantine_records (sku_id);
CREATE INDEX idx_quarantine_records_lpn_id ON quarantine_records (lpn_id);
CREATE INDEX idx_quarantine_records_financial_status ON quarantine_records (financial_status);
CREATE INDEX idx_quarantine_records_placed_at ON quarantine_records (placed_at);
