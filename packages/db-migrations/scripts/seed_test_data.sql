BEGIN;

-- Upsert Vendor
INSERT INTO vendors (vendor_id, dc_id, vendor_code, name, gstin, compliance_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'DC-001', 'V-001', 'Global Mart India', '27AABCT0000Z1Z1', 'Active')
ON CONFLICT (vendor_code) DO NOTHING;

-- Upsert SKUs
INSERT INTO skus (sku_id, dc_id, sku_code, name, category, packaging_class, is_ft, is_perishable, requires_cold, gst_rate, mrp, status)
VALUES 
('22222222-2222-2222-2222-222222222222', 'DC-001', 'SKU-001', 'Premium Basmati Rice 5kg', 'FMCG_Food', 'GunnyBag', true, false, false, 5.00, 500.00, 'Active'),
('33333333-3333-3333-3333-333333333333', 'DC-001', 'SKU-002', 'Organic Cold Pressed Mustard Oil 1L', 'FMCG_Food', 'SealedCarton', false, false, false, 18.00, 300.00, 'Active')
ON CONFLICT (dc_id, sku_code) DO NOTHING;

-- Upsert Purchase Order
INSERT INTO purchase_orders (po_id, dc_id, sap_po_number, vendor_id, status)
VALUES ('44444444-4444-4444-4444-444444444444', 'DC-001', 'PO-88291', '11111111-1111-1111-1111-111111111111', 'Open')
ON CONFLICT (sap_po_number) DO NOTHING;

-- Delete old PO lines for this PO to prevent duplicates if running multiple times
DELETE FROM po_lines WHERE po_id = '44444444-4444-4444-4444-444444444444';

-- Insert PO Lines
INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
VALUES 
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 1000, 400.00, 5.00, 0, 'Open'),
('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 500, 250.00, 18.00, 0, 'Open');

-- Insert Barcodes
INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
VALUES
('8901234567890', '22222222-2222-2222-2222-222222222222', 'EAN13', true),
('8909876543210', '33333333-3333-3333-3333-333333333333', 'EAN13', true)
ON CONFLICT (barcode) DO NOTHING;

COMMIT;
