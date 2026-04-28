import { describe, it, expect, vi } from 'vitest';
import { BarcodeService } from './barcode.service.js';
import type { Pool, QueryResult } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as any as QueryResult),
  } as unknown as Pool;
}

const BARCODE = '1234567890123';
const SKU_ID_A = 'sku-uuid-a';
const SKU_ID_B = 'sku-uuid-b';

const BARCODE_ROW = {
  barcode: BARCODE,
  sku_id: SKU_ID_A,
  barcode_type: 'EAN13',
  is_primary: true,
  created_at: '2024-01-01T00:00:00Z',
};

const SKU_DETAILS_A = {
  sku_id: SKU_ID_A,
  dc_id: 'DC01',
  sku_code: 'SKU-A',
  name: 'Product A',
  status: 'Active',
};

const SKU_DETAILS_B = {
  sku_id: SKU_ID_B,
  dc_id: 'DC01',
  sku_code: 'SKU-B',
  name: 'Product B',
  status: 'Active',
};

// ─── registerBarcode ──────────────────────────────────────────────────────────

describe('BarcodeService.registerBarcode', () => {
  it('succeeds when barcode is new', async () => {
    // dbRead returns no existing barcode; db inserts and returns the new row
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi.fn().mockResolvedValueOnce({ rows: [BARCODE_ROW], rowCount: 1 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new BarcodeService(db, dbRead);
    const result = await svc.registerBarcode(BARCODE, SKU_ID_A, 'EAN13', true);

    expect(result.barcode).toBe(BARCODE);
    expect(result.sku_id).toBe(SKU_ID_A);
    expect(result.barcode_type).toBe('EAN13');
    expect(result.is_primary).toBe(true);

    // Verify INSERT was called
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(insertCall[0]).toContain('INSERT INTO barcodes');
    expect(insertCall[1]).toEqual([BARCODE, SKU_ID_A, 'EAN13', true]);
  });

  it('succeeds (idempotent) when same barcode is registered to the same SKU', async () => {
    // dbRead returns existing row with same sku_id
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [BARCODE_ROW], rowCount: 1 } as any as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi.fn(),
    } as unknown as Pool;

    const svc = new BarcodeService(db, dbRead);
    const result = await svc.registerBarcode(BARCODE, SKU_ID_A, 'EAN13', true);

    // Returns existing row without inserting
    expect(result.barcode).toBe(BARCODE);
    expect(result.sku_id).toBe(SKU_ID_A);
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('throws BARCODE_CONFLICT when barcode already maps to a different SKU', async () => {
    // dbRead returns existing row with a DIFFERENT sku_id, then SKU details for that sku
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [BARCODE_ROW], rowCount: 1 } as any as QueryResult) // existing barcode
        .mockResolvedValueOnce({ rows: [SKU_DETAILS_A], rowCount: 1 } as any as QueryResult), // conflicting SKU details
    } as unknown as Pool;

    const db = { query: vi.fn() } as unknown as Pool;

    const svc = new BarcodeService(db, dbRead);

    // Attempt to register same barcode to a DIFFERENT SKU (SKU_ID_B)
    await expect(
      svc.registerBarcode(BARCODE, SKU_ID_B, 'EAN13', false),
    ).rejects.toMatchObject({
      code: 'BARCODE_CONFLICT',
      conflicting_sku: SKU_DETAILS_A,
    });

    // No INSERT should have been attempted
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ─── lookupBarcode ────────────────────────────────────────────────────────────

describe('BarcodeService.lookupBarcode', () => {
  it('returns SKU details for a known barcode', async () => {
    const lookupRow = {
      ...SKU_DETAILS_A,
      barcode: BARCODE,
      barcode_type: 'EAN13',
      is_primary: true,
    };

    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [lookupRow], rowCount: 1 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new BarcodeService(makePool(), dbRead);
    const result = await svc.lookupBarcode(BARCODE);

    expect(result.barcode).toBe(BARCODE);
    expect(result.sku_id).toBe(SKU_ID_A);
    expect(result.sku_code).toBe('SKU-A');
    expect(result.name).toBe('Product A');
    expect(result.status).toBe('Active');
  });

  it('throws BARCODE_NOT_FOUND for an unknown barcode', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
    } as unknown as Pool;

    const svc = new BarcodeService(makePool(), dbRead);

    await expect(svc.lookupBarcode('0000000000000')).rejects.toMatchObject({
      code: 'BARCODE_NOT_FOUND',
    });
  });
});
