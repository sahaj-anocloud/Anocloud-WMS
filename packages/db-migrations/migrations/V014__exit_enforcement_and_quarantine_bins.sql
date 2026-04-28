-- V014__exit_enforcement_and_quarantine_bins.sql
-- Add columns for vehicle exit override and quarantine bin confirmation

BEGIN;

-- 1. Yard Entries: add override fields
ALTER TABLE yard_entries 
ADD COLUMN IF NOT EXISTS exit_override_token TEXT,
ADD COLUMN IF NOT EXISTS exit_override_reason TEXT,
ADD COLUMN IF NOT EXISTS exit_override_by TEXT;

-- 2. Quarantine Records: add bin confirmation fields
ALTER TABLE quarantine_records
ADD COLUMN IF NOT EXISTS bin_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bin_confirmed_by TEXT;

-- 3. Over-delivery Holds table (for Item 3)
CREATE TABLE IF NOT EXISTS over_delivery_holds (
    hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(delivery_id),
    line_id UUID NOT NULL REFERENCES delivery_lines(line_id),
    sku_id UUID NOT NULL REFERENCES skus(sku_id), -- Added sku_id (Fix 3)
    po_line_id UUID NOT NULL REFERENCES po_lines(po_line_id), -- Added po_line_id (Fix 3)
    ordered_qty DECIMAL(12,2) NOT NULL,
    received_qty DECIMAL(12,2) NOT NULL,
    variance_pct DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMIT;
