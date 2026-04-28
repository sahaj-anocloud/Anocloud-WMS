import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SKUService, SKUCompletenessValidator } from './sku.service.js';
import type { Pool, QueryResult } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as any as QueryResult),
  } as unknown as Pool;
}

const BASE_FMCG_FOOD = {
  sku_code: 'SKU001',
  name: 'Test Product',
  category: 'FMCG_Food' as const,
  packaging_class: 'SealedCarton',
  gst_rate: 5,
  mrp: 100,
  length_mm: 200,
  width_mm: 150,
  height_mm: 100,
  weight_g: 500,
  barcodes: [{ barcode: '1234567890123', barcode_type: 'EAN13', is_primary: true }],
};

const BASE_FMCG_NON_FOOD = {
  sku_code: 'SKU002',
  name: 'Non-Food Product',
  category: 'FMCG_Non_Food' as unknown as 'FMCG_Food',
  packaging_class: 'ShrinkWrap',
  gst_rate: 18,
  mrp: 200,
  barcodes: [{ barcode: '9876543210987', barcode_type: 'EAN13', is_primary: true }],
};

// ─── SKUCompletenessValidator ─────────────────────────────────────────────────

describe('SKUCompletenessValidator', () => {
  it('returns empty array when all mandatory attributes present for FMCG_Food', () => {
    const missing = SKUCompletenessValidator('FMCG_Food', BASE_FMCG_FOOD);
    expect(missing).toEqual([]);
  });

  it('returns missing volumetric attributes for FMCG_Food when absent', () => {
    const data = { ...BASE_FMCG_FOOD, length_mm: undefined, weight_g: undefined };
    const missing = SKUCompletenessValidator('FMCG_Food', data);
    expect(missing).toContain('length_mm');
    expect(missing).toContain('weight_g');
  });

  it('returns missing volumetric attributes for BDF', () => {
    const data = { ...BASE_FMCG_FOOD, category: 'BDF' as const, height_mm: undefined };
    const missing = SKUCompletenessValidator('BDF', data);
    expect(missing).toContain('height_mm');
  });

  it('returns missing volumetric attributes for Fresh', () => {
    const data = { ...BASE_FMCG_FOOD, category: 'Fresh' as const, width_mm: undefined };
    const missing = SKUCompletenessValidator('Fresh', data);
    expect(missing).toContain('width_mm');
  });

  it('returns missing volumetric attributes for Chocolate', () => {
    const data = {
      ...BASE_FMCG_FOOD,
      category: 'Chocolate' as const,
      length_mm: undefined,
      width_mm: undefined,
      height_mm: undefined,
      weight_g: undefined,
    };
    const missing = SKUCompletenessValidator('Chocolate', data);
    expect(missing).toContain('length_mm');
    expect(missing).toContain('width_mm');
    expect(missing).toContain('height_mm');
    expect(missing).toContain('weight_g');
  });

  it('does NOT require volumetric data for non-volumetric categories', () => {
    // A category not in VOLUMETRIC_CATEGORIES should not require volumetric fields
    const data = {
      sku_code: 'SKU003',
      name: 'Detergent',
      category: 'FMCG_Non_Food' as never,
      packaging_class: 'ShrinkWrap',
      gst_rate: 18,
      mrp: 50,
      barcodes: [{ barcode: '1111111111111', barcode_type: 'EAN13' }],
    };
    const missing = SKUCompletenessValidator('FMCG_Non_Food' as never, data);
    expect(missing).not.toContain('length_mm');
    expect(missing).not.toContain('width_mm');
    expect(missing).not.toContain('height_mm');
    expect(missing).not.toContain('weight_g');
    expect(missing).toHaveLength(0);
  });

  it('returns barcode as missing when no barcodes provided', () => {
    const data = { ...BASE_FMCG_FOOD, barcodes: [] };
    const missing = SKUCompletenessValidator('FMCG_Food', data);
    expect(missing).toContain('barcode');
  });

  it('returns barcode as missing when barcodes is undefined', () => {
    const { barcodes: _b, ...data } = BASE_FMCG_FOOD;
    const missing = SKUCompletenessValidator('FMCG_Food', data);
    expect(missing).toContain('barcode');
  });

  it('returns all universal missing attributes when data is empty', () => {
    const missing = SKUCompletenessValidator('FMCG_Food', {});
    expect(missing).toContain('sku_code');
    expect(missing).toContain('name');
    expect(missing).toContain('category');
    expect(missing).toContain('packaging_class');
    expect(missing).toContain('gst_rate');
    expect(missing).toContain('mrp');
    expect(missing).toContain('barcode');
  });

  it('accepts barcodeCount as alternative to barcodes array', () => {
    const { barcodes: _b, ...data } = BASE_FMCG_FOOD;
    const missing = SKUCompletenessValidator('FMCG_Food', { ...data, barcodeCount: 1 });
    expect(missing).not.toContain('barcode');
  });
});

// ─── createSKU ────────────────────────────────────────────────────────────────

describe('SKUService.createSKU', () => {
  it('sets status to Active when all mandatory attributes present for FMCG_Food', async () => {
    const skuRow = {
      sku_id: 'uuid-sku-1',
      dc_id: 'DC01',
      ...BASE_FMCG_FOOD,
      is_ft: false,
      is_perishable: false,
      requires_cold: false,
      status: 'Active',
    };

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [skuRow], rowCount: 1 } as any as QueryResult) // INSERT skus
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult), // INSERT barcodes
    } as unknown as Pool;

    const svc = new SKUService(db, db);
    const result = await svc.createSKU('DC01', BASE_FMCG_FOOD);

    expect(result.status).toBe('Active');

    // Verify the INSERT was called with 'Active' status
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(insertCall[1]).toContain('Active');
  });

  it('sets status to Incomplete when volumetric data missing for FMCG_Food', async () => {
    const incompleteData = {
      ...BASE_FMCG_FOOD,
      length_mm: undefined,
      width_mm: undefined,
      height_mm: undefined,
      weight_g: undefined,
    };

    const skuRow = {
      sku_id: 'uuid-sku-2',
      dc_id: 'DC01',
      ...incompleteData,
      is_ft: false,
      is_perishable: false,
      requires_cold: false,
      status: 'Incomplete',
    };

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [skuRow], rowCount: 1 } as any as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new SKUService(db, db);
    const result = await svc.createSKU('DC01', incompleteData);

    expect(result.status).toBe('Incomplete');

    // Verify the INSERT was called with 'Incomplete' status
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(insertCall[1]).toContain('Incomplete');
  });

  it('sets status to Active for a non-volumetric category without volumetric data', async () => {
    // A category not in VOLUMETRIC_CATEGORIES (FMCG_Food, BDF, Fresh, Chocolate)
    // should not require volumetric fields.
    const nonVolumetricCategory = 'FMCG_Non_Food' as never;
    const nonVolumetricData = {
      sku_code: 'SKU-NV',
      name: 'Non Volumetric',
      category: nonVolumetricCategory,
      packaging_class: 'ShrinkWrap',
      gst_rate: 18,
      mrp: 50,
      barcodes: [{ barcode: '2222222222222', barcode_type: 'EAN13', is_primary: true }],
      // No volumetric fields — should be fine for non-volumetric category
    };

    // Pass the non-volumetric category as the first argument
    const missing = SKUCompletenessValidator(nonVolumetricCategory, nonVolumetricData);
    expect(missing).not.toContain('length_mm');
    expect(missing).not.toContain('width_mm');
    expect(missing).not.toContain('height_mm');
    expect(missing).not.toContain('weight_g');
    expect(missing).toHaveLength(0);

    // Also verify via createSKU: the service should set status to Active
    const skuRow = {
      sku_id: 'uuid-nv',
      dc_id: 'DC01',
      ...nonVolumetricData,
      is_ft: false,
      is_perishable: false,
      requires_cold: false,
      status: 'Active',
    };

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [skuRow], rowCount: 1 } as any as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new SKUService(db, db);
    const result = await svc.createSKU('DC01', nonVolumetricData);
    expect(result.status).toBe('Active');
  });
});

// ─── updateSKU ────────────────────────────────────────────────────────────────

describe('SKUService.updateSKU', () => {
  it('writes audit event with previous and new state', async () => {
    const previousSKU = {
      sku_id: 'uuid-sku-1',
      dc_id: 'DC01',
      sku_code: 'SKU001',
      name: 'Old Name',
      category: 'FMCG_Food',
      packaging_class: 'SealedCarton',
      is_ft: false,
      is_perishable: false,
      requires_cold: false,
      gst_rate: 5,
      mrp: 100,
      length_mm: 200,
      width_mm: 150,
      height_mm: 100,
      weight_g: 500,
      status: 'Active',
    };

    const updatedSKU = { ...previousSKU, name: 'New Name' };

    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [previousSKU], rowCount: 1 } as any as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [updatedSKU], rowCount: 1 } as any as QueryResult) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult), // audit INSERT
    } as unknown as Pool;

    const svc = new SKUService(db, dbRead);
    const result = await svc.updateSKU(
      'uuid-sku-1',
      { name: 'New Name', reason_code: 'CORRECTION' },
      'user-1',
      'device-1',
      'DC01',
    );

    expect(result.name).toBe('New Name');

    // Verify audit event was written
    const auditCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(auditCall[0]).toContain('INSERT INTO audit_events');
    // Check previous_state and new_state are in the audit payload
    const auditParams = auditCall[1] as unknown[];
    expect(auditParams[1]).toBe('SKU_ATTRIBUTE_UPDATED');
    expect(auditParams[2]).toBe('user-1');
    expect(auditParams[3]).toBe('device-1');
    // previous_state (index 5) should contain old name
    const prevState = JSON.parse(auditParams[5] as string) as Record<string, unknown>;
    expect(prevState['name']).toBe('Old Name');
    // new_state (index 6) should contain new name
    const newState = JSON.parse(auditParams[6] as string) as Record<string, unknown>;
    expect(newState['name']).toBe('New Name');
  });

  it('throws SKU_NOT_FOUND when SKU does not exist', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new SKUService(makePool(), dbRead);
    await expect(
      svc.updateSKU('nonexistent', { name: 'X' }, 'user-1', 'device-1', 'DC01'),
    ).rejects.toThrow('SKU_NOT_FOUND');
  });
});

// ─── bulkImportSKUs ───────────────────────────────────────────────────────────

describe('SKUService.bulkImportSKUs', () => {
  it('rejects entire batch if any row fails validation', async () => {
    const validRow = { ...BASE_FMCG_FOOD };
    const invalidRow = {
      ...BASE_FMCG_FOOD,
      sku_code: 'SKU-BAD',
      length_mm: undefined, // missing volumetric
    };

    const svc = new SKUService(makePool(), makePool());

    await expect(
      svc.bulkImportSKUs('DC01', [validRow, invalidRow]),
    ).rejects.toThrow('BULK_IMPORT_VALIDATION_FAILED');
  });

  it('rejects batch when all rows fail validation', async () => {
    const badRow1 = { ...BASE_FMCG_FOOD, length_mm: undefined };
    const badRow2 = { ...BASE_FMCG_FOOD, sku_code: 'SKU-BAD2', mrp: undefined as never };

    const svc = new SKUService(makePool(), makePool());

    await expect(
      svc.bulkImportSKUs('DC01', [badRow1, badRow2]),
    ).rejects.toThrow('BULK_IMPORT_VALIDATION_FAILED');
  });

  it('imports all rows when all pass validation', async () => {
    const row1 = { ...BASE_FMCG_FOOD };
    const row2 = { ...BASE_FMCG_FOOD, sku_code: 'SKU002', name: 'Product 2' };

    const skuRow1 = { sku_id: 'uuid-1', dc_id: 'DC01', ...row1, is_ft: false, is_perishable: false, requires_cold: false, status: 'Active' };
    const skuRow2 = { sku_id: 'uuid-2', dc_id: 'DC01', ...row2, is_ft: false, is_perishable: false, requires_cold: false, status: 'Active' };

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [skuRow1], rowCount: 1 } as any as QueryResult) // INSERT sku1
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult)         // INSERT barcode1
        .mockResolvedValueOnce({ rows: [skuRow2], rowCount: 1 } as any as QueryResult) // INSERT sku2
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult),        // INSERT barcode2
    } as unknown as Pool;

    const svc = new SKUService(db, db);
    const result = await svc.bulkImportSKUs('DC01', [row1, row2]);

    expect(result.imported).toBe(2);
    expect(result.skus).toHaveLength(2);
  });
});

// ─── assertSKUReceivable (BR-02) ──────────────────────────────────────────────

describe('SKUService.assertSKUReceivable', () => {
  it('throws RECEIPT_BLOCKED_INCOMPLETE_SKU when SKU is Incomplete', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ status: 'Incomplete' }],
        rowCount: 1,
      } as any as QueryResult),
    } as unknown as Pool;

    const svc = new SKUService(makePool(), dbRead);
    await expect(svc.assertSKUReceivable('sku-1')).rejects.toThrow(
      'RECEIPT_BLOCKED_INCOMPLETE_SKU',
    );
  });

  it('does not throw when SKU is Active', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ status: 'Active' }],
        rowCount: 1,
      } as any as QueryResult),
    } as unknown as Pool;

    const svc = new SKUService(makePool(), dbRead);
    await expect(svc.assertSKUReceivable('sku-1')).resolves.toBeUndefined();
  });

  it('throws SKU_NOT_FOUND when SKU does not exist', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new SKUService(makePool(), dbRead);
    await expect(svc.assertSKUReceivable('nonexistent')).rejects.toThrow('SKU_NOT_FOUND');
  });
});
