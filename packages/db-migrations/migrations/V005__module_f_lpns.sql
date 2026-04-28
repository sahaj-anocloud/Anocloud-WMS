-- V005: Module F — Barcode / LPN / Relabeling Framework
-- Tables: lpns

CREATE TABLE lpns (
  lpn_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id            VARCHAR(20) NOT NULL,
  lpn_barcode      VARCHAR(100) UNIQUE NOT NULL,  -- GS1-128 encoded
  sku_id           UUID NOT NULL REFERENCES skus(sku_id),
  delivery_line_id UUID REFERENCES delivery_lines(line_id),
  batch_number     VARCHAR(100),
  expiry_date      DATE,
  location         VARCHAR(50),
  status           VARCHAR(20) NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active','Consumed','Reprinted','Voided')),
  printed_by       UUID NOT NULL,
  printed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_reprinted     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_lpns_dc_id ON lpns (dc_id);
CREATE INDEX idx_lpns_sku_id ON lpns (sku_id);
CREATE INDEX idx_lpns_delivery_line_id ON lpns (delivery_line_id);
CREATE INDEX idx_lpns_status ON lpns (status);
CREATE INDEX idx_lpns_lpn_barcode ON lpns (lpn_barcode);
