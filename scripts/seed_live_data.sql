-- Yard entries using correct schema
INSERT INTO yard_entries (entry_id, dc_id, vehicle_reg, vendor_id, asn_id, gate_in_at, dock_assigned_at, status)
SELECT
  gen_random_uuid(), 'DC-BLR-01', 'KA-01-AB-1234',
  v.vendor_id, NULL,
  NOW() - INTERVAL '45 minutes',
  NOW() - INTERVAL '38 minutes',
  'AtDock'
FROM vendors v WHERE v.vendor_code = 'VND-001' AND v.dc_id = 'DC-BLR-01';

INSERT INTO yard_entries (entry_id, dc_id, vehicle_reg, vendor_id, asn_id, gate_in_at, status)
SELECT
  gen_random_uuid(), 'DC-BLR-01', 'KA-03-CD-5678',
  v.vendor_id, NULL,
  NOW() - INTERVAL '18 minutes',
  'InYard'
FROM vendors v WHERE v.vendor_code = 'VND-002' AND v.dc_id = 'DC-BLR-01';

INSERT INTO yard_entries (entry_id, dc_id, vehicle_reg, vendor_id, asn_id, gate_in_at, dock_assigned_at, unloading_start, status)
SELECT
  gen_random_uuid(), 'DC-BLR-01', 'MH-12-EF-9012',
  v.vendor_id, NULL,
  NOW() - INTERVAL '95 minutes',
  NOW() - INTERVAL '88 minutes',
  NOW() - INTERVAL '82 minutes',
  'Unloading'
FROM vendors v WHERE v.vendor_code = 'VND-004' AND v.dc_id = 'DC-BLR-01';

INSERT INTO yard_entries (entry_id, dc_id, vehicle_reg, vendor_id, asn_id, gate_in_at, status)
SELECT
  gen_random_uuid(), 'DC-BLR-01', 'DL-07-GH-3344',
  v.vendor_id, NULL,
  NOW() - INTERVAL '10 minutes',
  'Holding'
FROM vendors v WHERE v.vendor_code = 'VND-005' AND v.dc_id = 'DC-BLR-01';

-- Alerts using correct schema (no message col, use reference_doc + payload)
INSERT INTO alerts (alert_id, dc_id, alert_type, severity, reference_doc, payload, triggered_at)
VALUES
  (
    gen_random_uuid(), 'DC-BLR-01', 'GST_MISMATCH', 'Critical', 'PO-88292',
    '{"vendor_name":"Amul Dairy Corp","asn_id":"ASN-9919-B","po_number":"PO-88292","sku":"SKU-MILK-001","message":"Invoice GST 5% vs PO 12%. SAP auto-hold triggered.","expected_qty":12,"actual_qty":5,"variance":-7}',
    NOW() - INTERVAL '35 minutes'
  ),
  (
    gen_random_uuid(), 'DC-BLR-01', 'QUANTITY_SHORTAGE', 'Warning', 'PO-88291',
    '{"vendor_name":"Patanjali Foods Ltd","asn_id":"ASN-9916-A","po_number":"PO-88291","sku":"SKU-RICE-001","message":"Received 580 units vs declared 640. 60-unit shortage.","expected_qty":640,"actual_qty":580,"variance":-60}',
    NOW() - INTERVAL '72 minutes'
  ),
  (
    gen_random_uuid(), 'DC-BLR-01', 'MOQ_VIOLATION', 'Warning', 'PO-88293',
    '{"vendor_name":"Britannia Industries","asn_id":"ASN-9909-A","po_number":"PO-88293","sku":"SKU-BIS-044","message":"Received 92 units vs MOQ 100. Finance notified.","expected_qty":100,"actual_qty":92,"variance":-8}',
    NOW() - INTERVAL '125 minutes'
  ),
  (
    gen_random_uuid(), 'DC-BLR-01', 'BARCODE_MISMATCH', 'Critical', 'PO-88291',
    '{"vendor_name":"Patanjali Foods Ltd","asn_id":"ASN-9921-A","po_number":"PO-88291","sku":"SKU-OIL-012","message":"Scanned barcode does not match ASN SKU. Physical item is Ghee 500ml but ASN lists Ghee 1L."}',
    NOW() - INTERVAL '22 minutes'
  ),
  (
    gen_random_uuid(), 'DC-BLR-01', 'GKM_HARD_STOP', 'Critical', NULL,
    '{"vendor_name":"Amul Dairy Corp","vehicle_reg":"KA-03-CD-5678","message":"GKM check failed: vendor documents expired. Vehicle blocked at gate."}',
    NOW() - INTERVAL '15 minutes'
  ),
  (
    gen_random_uuid(), 'DC-BLR-01', 'SAP_SYNC_DISCREPANCY', 'Warning', 'PO-88291',
    '{"sku":"SKU-RICE-001","message":"WMS stock 1180 vs SAP 1200. Variance: -20 units.","wms_qty":1180,"sap_qty":1200,"variance":-20}',
    NOW() - INTERVAL '180 minutes'
  );
