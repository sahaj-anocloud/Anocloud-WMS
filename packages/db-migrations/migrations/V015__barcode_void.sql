-- V015__barcode_void.sql
-- Add voided_at and voided_by columns to barcodes table for protection against voided barcodes

BEGIN;

ALTER TABLE barcodes 
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS voided_by UUID;

-- Optional: Index for voided_at to optimize lookup filtering
CREATE INDEX IF NOT EXISTS idx_barcodes_voided_at ON barcodes (voided_at) WHERE voided_at IS NULL;

COMMIT;
