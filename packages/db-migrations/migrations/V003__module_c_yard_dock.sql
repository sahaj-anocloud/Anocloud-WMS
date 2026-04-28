-- V003: Module C — Yard and Dock Management
-- Tables: yard_entries

CREATE TABLE yard_entries (
  entry_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id            VARCHAR(20) NOT NULL,
  vehicle_reg      VARCHAR(30) NOT NULL,
  vendor_id        UUID NOT NULL REFERENCES vendors(vendor_id),
  asn_id           UUID REFERENCES asns(asn_id),
  appointment_id   UUID REFERENCES appointments(appointment_id),
  gate_in_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  gate_out_at      TIMESTAMPTZ,
  dock_assigned_at TIMESTAMPTZ,
  unloading_start  TIMESTAMPTZ,
  unloading_end    TIMESTAMPTZ,
  status           VARCHAR(20) NOT NULL DEFAULT 'InYard'
    CHECK (status IN ('InYard','AtDock','Unloading','Departed','Holding')),
  -- Gate-out must be >= gate-in (BR-06 timestamp integrity)
  CONSTRAINT chk_gate_timestamps CHECK (gate_out_at IS NULL OR gate_out_at >= gate_in_at)
);

CREATE INDEX idx_yard_entries_dc_id ON yard_entries (dc_id);
CREATE INDEX idx_yard_entries_vendor_id ON yard_entries (vendor_id);
CREATE INDEX idx_yard_entries_asn_id ON yard_entries (asn_id);
CREATE INDEX idx_yard_entries_appointment_id ON yard_entries (appointment_id);
CREATE INDEX idx_yard_entries_status ON yard_entries (status);
CREATE INDEX idx_yard_entries_gate_in_at ON yard_entries (gate_in_at);
