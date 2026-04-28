-- V002: Module B — PO, ASN, Appointments
-- Tables: purchase_orders, po_lines, asns, appointments

-- Requires btree_gist extension for EXCLUDE USING gist on scalar + range columns
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ─── Purchase Orders ──────────────────────────────────────────────────────────

CREATE TABLE purchase_orders (
  po_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         VARCHAR(20) NOT NULL,
  sap_po_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id     UUID NOT NULL REFERENCES vendors(vendor_id),
  status        VARCHAR(20) NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open','InProgress','Closed','PartiallyClosed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sap_synced_at TIMESTAMPTZ
);

CREATE INDEX idx_purchase_orders_dc_id ON purchase_orders (dc_id);
CREATE INDEX idx_purchase_orders_vendor_id ON purchase_orders (vendor_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders (status);
CREATE INDEX idx_purchase_orders_sap_po_number ON purchase_orders (sap_po_number);

-- ─── PO Lines ─────────────────────────────────────────────────────────────────

CREATE TABLE po_lines (
  po_line_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id        UUID NOT NULL REFERENCES purchase_orders(po_id),
  sku_id       UUID NOT NULL REFERENCES skus(sku_id),
  ordered_qty  NUMERIC(12,3) NOT NULL,
  unit_price   NUMERIC(12,4) NOT NULL,
  gst_rate     NUMERIC(5,2) NOT NULL,
  received_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open','Blocked','Closed'))
);

CREATE INDEX idx_po_lines_po_id ON po_lines (po_id);
CREATE INDEX idx_po_lines_sku_id ON po_lines (sku_id);
CREATE INDEX idx_po_lines_status ON po_lines (status);

-- ─── ASNs ─────────────────────────────────────────────────────────────────────

CREATE TABLE asns (
  asn_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id            VARCHAR(20) NOT NULL,
  vendor_id        UUID NOT NULL REFERENCES vendors(vendor_id),
  po_id            UUID NOT NULL REFERENCES purchase_orders(po_id),
  channel          VARCHAR(30) NOT NULL
    CHECK (channel IN ('Portal','Email','Paper','BuyerFallback')),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  status           VARCHAR(20) NOT NULL DEFAULT 'Submitted'
    CHECK (status IN ('Submitted','Active','Cancelled','Expired')),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_late          BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_asns_dc_id ON asns (dc_id);
CREATE INDEX idx_asns_vendor_id ON asns (vendor_id);
CREATE INDEX idx_asns_po_id ON asns (po_id);
CREATE INDEX idx_asns_status ON asns (status);

-- ─── Appointments ─────────────────────────────────────────────────────────────

CREATE TABLE appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id          VARCHAR(20) NOT NULL,
  asn_id         UUID NOT NULL REFERENCES asns(asn_id),
  vendor_id      UUID NOT NULL REFERENCES vendors(vendor_id),
  dock_door      VARCHAR(20) NOT NULL,
  slot_start     TIMESTAMPTZ NOT NULL,
  slot_end       TIMESTAMPTZ NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'Confirmed'
    CHECK (status IN ('Requested','Confirmed','Cancelled','Completed','NoShow')),
  is_heavy_truck BOOLEAN NOT NULL DEFAULT false,
  -- Collision-free constraint: no two confirmed appointments overlap on same dock
  EXCLUDE USING gist (dock_door WITH =, tstzrange(slot_start, slot_end) WITH &&)
    WHERE (status = 'Confirmed')
);

CREATE INDEX idx_appointments_dc_id ON appointments (dc_id);
CREATE INDEX idx_appointments_asn_id ON appointments (asn_id);
CREATE INDEX idx_appointments_vendor_id ON appointments (vendor_id);
CREATE INDEX idx_appointments_status ON appointments (status);
CREATE INDEX idx_appointments_slot_start ON appointments (slot_start);
