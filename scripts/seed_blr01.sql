BEGIN;

-- ── Vendors ──────────────────────────────────────────────────────────────────
INSERT INTO vendors (vendor_id, dc_id, vendor_code, name, gstin, compliance_status)
VALUES
  (gen_random_uuid(), 'DC-BLR-01', 'VND-001', 'Patanjali Foods Ltd',  '27AABCT1234Z1Z1', 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'VND-002', 'Amul Dairy Corp',      '27AABCA5678Z1Z2', 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'VND-003', 'ITC Limited',          '27AABCI9012Z1Z3', 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'VND-004', 'Britannia Industries', '27AABCB3456Z1Z4', 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'VND-005', 'HUL India',            '27AABCH7890Z1Z5', 'Active')
ON CONFLICT (vendor_code) DO NOTHING;

-- ── SKUs ─────────────────────────────────────────────────────────────────────
INSERT INTO skus (sku_id, dc_id, sku_code, name, category, packaging_class, is_ft, is_perishable, requires_cold, gst_rate, mrp, status)
VALUES
  (gen_random_uuid(), 'DC-BLR-01', 'SKU-RICE-001', 'India Gate Basmati 5kg',   'FMCG_Food', 'GunnyBag',    false, false, false,  5.00, 580.00, 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'SKU-OIL-012',  'Patanjali Mustard Oil 1L', 'FMCG_Food', 'SealedCarton',false, false, false, 12.00, 180.00, 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'SKU-MILK-001', 'Amul Full Cream Milk 1L',  'Fresh_FV',  'SealedCarton',true,  true,  true,   0.00,  68.00, 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'SKU-BIS-044',  'Britannia Good Day 200g',  'FMCG_Food', 'SealedCarton',false, false, false, 18.00,  45.00, 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'SKU-TEA-019',  'Tata Tea Gold 500g',       'FMCG_Food', 'SealedCarton',false, false, false,  5.00, 220.00, 'Active'),
  (gen_random_uuid(), 'DC-BLR-01', 'SKU-SOD-008',  'Surf Excel 1kg',           'FMCG_NonFood','SealedCarton',false,false, false, 18.00, 175.00, 'Active')
ON CONFLICT (dc_id, sku_code) DO NOTHING;

-- ── Purchase Orders ───────────────────────────────────────────────────────────
INSERT INTO purchase_orders (po_id, dc_id, sap_po_number, vendor_id, status)
SELECT gen_random_uuid(), 'DC-BLR-01', 'PO-88291', v.vendor_id, 'Open'
FROM vendors v WHERE v.vendor_code='VND-001' AND v.dc_id='DC-BLR-01'
ON CONFLICT (sap_po_number) DO NOTHING;

INSERT INTO purchase_orders (po_id, dc_id, sap_po_number, vendor_id, status)
SELECT gen_random_uuid(), 'DC-BLR-01', 'PO-88292', v.vendor_id, 'Open'
FROM vendors v WHERE v.vendor_code='VND-002' AND v.dc_id='DC-BLR-01'
ON CONFLICT (sap_po_number) DO NOTHING;

INSERT INTO purchase_orders (po_id, dc_id, sap_po_number, vendor_id, status)
SELECT gen_random_uuid(), 'DC-BLR-01', 'PO-88293', v.vendor_id, 'Open'
FROM vendors v WHERE v.vendor_code='VND-004' AND v.dc_id='DC-BLR-01'
ON CONFLICT (sap_po_number) DO NOTHING;

INSERT INTO purchase_orders (po_id, dc_id, sap_po_number, vendor_id, status)
SELECT gen_random_uuid(), 'DC-BLR-01', 'PO-88294', v.vendor_id, 'Open'
FROM vendors v WHERE v.vendor_code='VND-005' AND v.dc_id='DC-BLR-01'
ON CONFLICT (sap_po_number) DO NOTHING;

-- ── PO Lines (dynamic lookups) ────────────────────────────────────────────────
INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
SELECT po.po_id, s.sku_id, 1200, 480.00, 5.00, 0, 'Open'
FROM purchase_orders po, skus s
WHERE po.sap_po_number='PO-88291' AND s.sku_code='SKU-RICE-001' AND s.dc_id='DC-BLR-01';

INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
SELECT po.po_id, s.sku_id, 840, 150.00, 12.00, 0, 'Open'
FROM purchase_orders po, skus s
WHERE po.sap_po_number='PO-88291' AND s.sku_code='SKU-OIL-012' AND s.dc_id='DC-BLR-01';

INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
SELECT po.po_id, s.sku_id, 500, 58.00, 0.00, 0, 'Open'
FROM purchase_orders po, skus s
WHERE po.sap_po_number='PO-88292' AND s.sku_code='SKU-MILK-001' AND s.dc_id='DC-BLR-01';

INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
SELECT po.po_id, s.sku_id, 2400, 38.00, 18.00, 0, 'Open'
FROM purchase_orders po, skus s
WHERE po.sap_po_number='PO-88293' AND s.sku_code='SKU-BIS-044' AND s.dc_id='DC-BLR-01';

INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
SELECT po.po_id, s.sku_id, 960, 140.00, 18.00, 0, 'Open'
FROM purchase_orders po, skus s
WHERE po.sap_po_number='PO-88294' AND s.sku_code='SKU-SOD-008' AND s.dc_id='DC-BLR-01';

-- ── Barcodes ─────────────────────────────────────────────────────────────────
INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
SELECT '8901234567890', sku_id, 'EAN13', true FROM skus WHERE sku_code='SKU-RICE-001' AND dc_id='DC-BLR-01'
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
SELECT '8909876543210', sku_id, 'EAN13', true FROM skus WHERE sku_code='SKU-OIL-012' AND dc_id='DC-BLR-01'
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
SELECT '8904900000001', sku_id, 'EAN13', true FROM skus WHERE sku_code='SKU-MILK-001' AND dc_id='DC-BLR-01'
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
SELECT '8901063011092', sku_id, 'EAN13', true FROM skus WHERE sku_code='SKU-BIS-044' AND dc_id='DC-BLR-01'
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
SELECT '8901030890888', sku_id, 'EAN13', true FROM skus WHERE sku_code='SKU-TEA-019' AND dc_id='DC-BLR-01'
ON CONFLICT (barcode) DO NOTHING;

-- ── KPI Snapshot ─────────────────────────────────────────────────────────────
INSERT INTO kpi_snapshots (
  dc_id,
  asn_coverage_rate, gate_to_grn_time_avg_min, perishable_dwell_avg_min,
  receipt_first_pass_yield, barcode_remediation_rate, scanning_compliance_rate,
  batch_capture_rate, inventory_accuracy_rate, vendor_compliance_rate,
  total_deliveries, total_asns
) VALUES (
  'DC-BLR-01',
  84.5, 52.3, 22.1,
  91.2, 4.8, 97.6,
  88.9, 99.1, 96.3,
  12, 15
);

COMMIT;
