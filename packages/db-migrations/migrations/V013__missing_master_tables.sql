-- V013__missing_master_tables.sql
-- Missing Master Tables for Vendor Sites, Trust Tiers, Schedule Policies, Pack Hierarchy, and Dock Zones

BEGIN;

-- 1. Vendor Trust Tiers
CREATE TABLE IF NOT EXISTS vendor_trust_tiers (
    tier_id TEXT PRIMARY KEY, -- 'Gold', 'Silver', 'Bronze'
    tier_name TEXT NOT NULL,
    confidence_threshold INT NOT NULL DEFAULT 90,
    sampling_modifier DECIMAL(3,2) NOT NULL DEFAULT 1.00, -- Multiplier for scan count
    gate_scrutiny_level TEXT DEFAULT 'Normal'
);

-- Seed Trust Tiers
INSERT INTO vendor_trust_tiers (tier_id, tier_name, confidence_threshold, sampling_modifier, gate_scrutiny_level)
VALUES 
('Gold', 'Gold Tier', 95, 0.50, 'Low'),
('Silver', 'Silver Tier', 80, 1.00, 'Normal'),
('Bronze', 'Bronze Tier', 50, 2.00, 'High')
ON CONFLICT (tier_id) DO UPDATE SET
    confidence_threshold = EXCLUDED.confidence_threshold,
    sampling_modifier = EXCLUDED.sampling_modifier,
    gate_scrutiny_level = EXCLUDED.gate_scrutiny_level;

-- Add trust_tier_id to vendors table if it exists
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors' AND column_name='trust_tier_id') THEN
            ALTER TABLE vendors ADD COLUMN trust_tier_id TEXT REFERENCES vendor_trust_tiers(tier_id) DEFAULT 'Silver';
        END IF;
    END IF;
END $$;

-- 2. Vendor Sites
CREATE TABLE IF NOT EXISTS vendor_sites (
    site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id),
    site_code TEXT NOT NULL,
    site_name TEXT NOT NULL,
    address TEXT NOT NULL,
    contact_matrix JSONB, -- contact persons, phones, emails
    gstin TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Vendor Schedule Policies
CREATE TABLE IF NOT EXISTS vendor_schedule_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(vendor_id),
    category_id TEXT NOT NULL, -- e.g. 'FMCG_Food', 'Fresh'
    delivery_days INT[] NOT NULL, -- 0=Sunday, 1=Monday...
    cutoff_time TIME NOT NULL,
    moq_quantity DECIMAL(12,2) NOT NULL,
    lead_time_hours INT NOT NULL,
    blackout_dates DATE[], -- Added blackout_dates (Fix 2)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Pack Hierarchy
CREATE TABLE IF NOT EXISTS pack_hierarchy (
    hierarchy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id UUID NOT NULL REFERENCES skus(sku_id),
    level TEXT NOT NULL, -- 'Item', 'Inner', 'Carton', 'Pallet'
    quantity DECIMAL(12,2) NOT NULL,
    uom TEXT NOT NULL,
    length_mm DECIMAL(10,2),
    width_mm DECIMAL(10,2),
    height_mm DECIMAL(10,2),
    weight_g DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sku_id, level)
);

-- 5. Dock Zones
CREATE TABLE IF NOT EXISTS dock_zones (
    zone_id TEXT PRIMARY KEY, -- 'ZONE-01-AMBIENT'
    dc_id VARCHAR(20) NOT NULL,
    zone_name TEXT NOT NULL,
    temp_class TEXT NOT NULL, -- 'Ambient', 'Cold'
    capacity DECIMAL(12,2),
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Dock Zones using actual dc_id from yard_entries if available (Fix 1)
DO $$
DECLARE
    v_dc_id VARCHAR(20);
BEGIN
    SELECT dc_id INTO v_dc_id FROM yard_entries LIMIT 1;
    
    -- Fallback to 'DC-BASE' if no yard entries exist yet
    IF v_dc_id IS NULL THEN
        v_dc_id := 'DC-BASE';
    END IF;

    INSERT INTO dock_zones (zone_id, dc_id, zone_name, temp_class, capacity)
    VALUES 
    ('Z-AMB-01', v_dc_id, 'Ambient Quarantine Zone 01', 'Ambient', 1000),
    ('Z-COLD-01', v_dc_id, 'Cold Quarantine Zone 01', 'Cold', 500)
    ON CONFLICT (zone_id) DO NOTHING;
END $$;

COMMIT;
