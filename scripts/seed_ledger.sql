INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Available', 1180, NOW()
FROM skus s WHERE s.sku_code = 'SKU-RICE-001' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Available', 820, NOW()
FROM skus s WHERE s.sku_code = 'SKU-OIL-012' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Quarantined', 60, NOW()
FROM skus s WHERE s.sku_code = 'SKU-OIL-012' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Held', 120, NOW()
FROM skus s WHERE s.sku_code = 'SKU-MILK-001' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Available', 2350, NOW()
FROM skus s WHERE s.sku_code = 'SKU-BIS-044' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Held', 50, NOW()
FROM skus s WHERE s.sku_code = 'SKU-BIS-044' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Available', 960, NOW()
FROM skus s WHERE s.sku_code = 'SKU-TEA-019' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'InTransit', 240, NOW()
FROM skus s WHERE s.sku_code = 'SKU-TEA-019' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity, updated_at)
SELECT 'DC-BLR-01', s.sku_id, 'Rejected', 20, NOW()
FROM skus s WHERE s.sku_code = 'SKU-RICE-001' AND s.dc_id = 'DC-BLR-01'
ON CONFLICT (dc_id, sku_id, stock_state) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();
