-- V001: Module A — Master Data Management
-- Tables: vendors, vendor_documents, skus, barcodes

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ─── Vendors ─────────────────────────────────────────────────────────────────

CREATE TABLE vendors (
  vendor_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id             VARCHAR(20) NOT NULL,
  vendor_code       VARCHAR(50) UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  gstin             VARCHAR(15) NOT NULL,
  compliance_status VARCHAR(20) NOT NULL
    CHECK (compliance_status IN ('Active','Suspended','Pending')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendors_dc_id ON vendors (dc_id);
CREATE INDEX idx_vendors_compliance_status ON vendors (compliance_status);
CREATE INDEX idx_vendors_vendor_code ON vendors (vendor_code);

-- ─── Vendor Documents ─────────────────────────────────────────────────────────

CREATE TABLE vendor_documents (
  doc_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID NOT NULL REFERENCES vendors(vendor_id),
  doc_type     VARCHAR(50) NOT NULL,  -- GSTIN | FSSAI | KYC
  file_s3_key  TEXT NOT NULL,
  uploaded_by  UUID NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date  DATE,
  status       VARCHAR(20) NOT NULL
    CHECK (status IN ('Active','Expired','Superseded')),
  approved_by  UUID,
  approved_at  TIMESTAMPTZ,
  version      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_vendor_documents_vendor_id ON vendor_documents (vendor_id);
CREATE INDEX idx_vendor_documents_expiry_date ON vendor_documents (expiry_date)
  WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_vendor_documents_status ON vendor_documents (status);

-- ─── SKUs ─────────────────────────────────────────────────────────────────────

CREATE TABLE skus (
  sku_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id           VARCHAR(20) NOT NULL,
  sku_code        VARCHAR(50) NOT NULL,
  name            TEXT NOT NULL,
  category        VARCHAR(50) NOT NULL,  -- FMCG_Food | BDF | Fresh | Chocolate
  packaging_class VARCHAR(30) NOT NULL,  -- SealedCarton | GunnyBag | Rice | ShrinkWrap | Loose
  is_ft           BOOLEAN NOT NULL DEFAULT false,
  is_perishable   BOOLEAN NOT NULL DEFAULT false,
  requires_cold   BOOLEAN NOT NULL DEFAULT false,  -- BR-18 chocolate flag
  gst_rate        NUMERIC(5,2) NOT NULL,
  mrp             NUMERIC(12,2) NOT NULL,
  length_mm       NUMERIC(8,2),
  width_mm        NUMERIC(8,2),
  height_mm       NUMERIC(8,2),
  weight_g        NUMERIC(10,3),
  status          VARCHAR(20) NOT NULL DEFAULT 'Incomplete'
    CHECK (status IN ('Active','Inactive','Incomplete')),
  UNIQUE (dc_id, sku_code)
);

CREATE INDEX idx_skus_dc_id ON skus (dc_id);
CREATE INDEX idx_skus_status ON skus (status);
CREATE INDEX idx_skus_category ON skus (category);
CREATE INDEX idx_skus_is_ft ON skus (is_ft);

-- ─── Barcodes ─────────────────────────────────────────────────────────────────
-- Injective barcode-to-SKU mapping (one barcode -> one SKU)

CREATE TABLE barcodes (
  barcode      VARCHAR(100) PRIMARY KEY,
  sku_id       UUID NOT NULL REFERENCES skus(sku_id),
  barcode_type VARCHAR(20) NOT NULL,  -- EAN13 | GS1128 | LPN | QR
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_barcodes_sku_id ON barcodes (sku_id);
