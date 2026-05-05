-- V020: Add acknowledgement columns to alerts table
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID;
