import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POService } from './po.service.js';
import type { Pool, QueryResult } from 'pg';
import type { SAPPOPayload, PORow, POLineRow } from './po.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult),
  } as unknown as Pool;
}

const BASE_PAYLOAD: SAPPOPayload = {
  sap_po_number: 'SAP-PO-001',
  dc_id: 'DC01',
  vendor_id: 'vendor-uuid-1',
  lines: [
    { sku_id: 'sku-uuid-1', ordered_qty: 100, unit_price: 50.0, gst_rate: 5 },
    { sku_id: 'sku-uuid-2', ordered_qty: 200, unit_price: 25.0, gst_rate: 12 },
  ],
};

const MOCK_PO: PORow = {
  po_id: 'po-uuid-1',
  dc_id: 'DC01',
  sap_po_number: 'SAP-PO-001',
  vendor_id: 'vendor-uuid-1',
  status: 'Open',
  created_at: '2024-01-01T00:00:00Z',
  sap_synced_at: '2024-01-01T00:00:00Z',
};

const MOCK_LINE_1: POLineRow = {
  po_line_id: 'line-uuid-1',
  po_id: 'po-uuid-1',
  sku_id: 'sku-uuid-1',
  ordered_qty: 100,
  unit_price: 50.0,
  gst_rate: 5,
  received_qty: 0,
  status: 'Open',
};

const MOCK_LINE_2: POLineRow = {
  po_line_id: 'line-uuid-2',
  po_id: 'po-uuid-1',
  sku_id: 'sku-uuid-2',
  ordered_qty: 200,
  unit_price: 25.0,
  gst_rate: 12,
  received_qty: 0,
  status: 'Open',
};

// ─── syncFromSAP ──────────────────────────────────────────────────────────────

describe('POService.syncFromSAP', () => {
  it('creates new PO and lines when sap_po_number is new', async () => {
    const dbRead = {
      query: vi
        .fn()
        // No existing PO
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
        // SKU 1 is Active
        .mockResolvedValueOnce({ rows: [{ status: 'Active' }], rowCount: 1 } as QueryResult)
        // SKU 2 is Active
        .mockResolvedValueOnce({ rows: [{ status: 'Active' }], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        // INSERT purchase_orders
        .mockResolvedValueOnce({ rows: [MOCK_PO], rowCount: 1 } as QueryResult)
        // INSERT po_lines line 1
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        // INSERT po_lines line 2
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        // INSERT audit_events
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    const result = await svc.syncFromSAP(BASE_PAYLOAD);

    expect(result.created).toBe(true);
    expect(result.po_id).toBe('po-uuid-1');
    expect(result.sap_po_number).toBe('SAP-PO-001');
    expect(result.blocked_lines).toHaveLength(0);

    // Verify PO was inserted
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(insertCall[0]).toContain('INSERT INTO purchase_orders');
    expect(insertCall[1]).toContain('SAP-PO-001');
  });

  it('is idempotent — second call with same sap_po_number does not create duplicate', async () => {
    const dbRead = {
      query: vi
        .fn()
        // Existing PO found
        .mockResolvedValueOnce({ rows: [MOCK_PO], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi.fn(),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    const result = await svc.syncFromSAP(BASE_PAYLOAD);

    expect(result.created).toBe(false);
    expect(result.po_id).toBe('po-uuid-1');
    expect(result.blocked_lines).toHaveLength(0);

    // No writes should have occurred
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('flags PO line as Blocked when SKU is not Active', async () => {
    const dbRead = {
      query: vi
        .fn()
        // No existing PO
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
        // SKU 1 is Inactive (not Active)
        .mockResolvedValueOnce({ rows: [{ status: 'Inactive' }], rowCount: 1 } as QueryResult)
        // SKU 2 is Active
        .mockResolvedValueOnce({ rows: [{ status: 'Active' }], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        // INSERT purchase_orders
        .mockResolvedValueOnce({ rows: [MOCK_PO], rowCount: 1 } as QueryResult)
        // INSERT po_lines line 1 (Blocked)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        // INSERT po_lines line 2 (Open)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        // INSERT audit_events
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        // INSERT alerts
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    const result = await svc.syncFromSAP(BASE_PAYLOAD);

    expect(result.created).toBe(true);
    expect(result.blocked_lines).toContain('sku-uuid-1');
    expect(result.blocked_lines).not.toContain('sku-uuid-2');

    // Verify line 1 was inserted with 'Blocked' status
    const line1InsertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(line1InsertCall[0]).toContain('INSERT INTO po_lines');
    expect(line1InsertCall[1]).toContain('Blocked');

    // Verify line 2 was inserted with 'Open' status
    const line2InsertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(line2InsertCall[1]).toContain('Open');

    // Verify alert was created
    const alertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[4];
    expect(alertCall[0]).toContain('INSERT INTO alerts');
    expect(alertCall[0]).toContain('PO_LINE_BLOCKED_INACTIVE_SKU');
  });

  it('also flags PO line as Blocked when SKU does not exist', async () => {
    const dbRead = {
      query: vi
        .fn()
        // No existing PO
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
        // SKU not found
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [MOCK_PO], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    const result = await svc.syncFromSAP({
      ...BASE_PAYLOAD,
      lines: [{ sku_id: 'nonexistent-sku', ordered_qty: 10, unit_price: 5, gst_rate: 5 }],
    });

    expect(result.blocked_lines).toContain('nonexistent-sku');
  });
});

// ─── closePOLine ──────────────────────────────────────────────────────────────

describe('POService.closePOLine', () => {
  it('closes line without backorder when short-delivered (BR-13)', async () => {
    const closedLine: POLineRow = { ...MOCK_LINE_1, received_qty: 80, status: 'Closed' };

    const dbRead = {
      query: vi
        .fn()
        // Fetch line
        .mockResolvedValueOnce({ rows: [MOCK_LINE_1], rowCount: 1 } as QueryResult)
        // Remaining open lines count (0 remaining)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        // UPDATE po_lines
        .mockResolvedValueOnce({ rows: [closedLine], rowCount: 1 } as QueryResult)
        // UPDATE purchase_orders
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    // Short delivery: ordered 100, received only 80
    const result = await svc.closePOLine('line-uuid-1', 80);

    expect(result.status).toBe('Closed');
    expect(result.received_qty).toBe(80);

    // Verify line was closed with received_qty = 80 (not ordered_qty = 100)
    const updateCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[0]).toContain("status = 'Closed'");
    expect(updateCall[1][0]).toBe(80);
  });

  it('transitions PO to Closed when all lines are closed', async () => {
    const closedLine: POLineRow = { ...MOCK_LINE_1, received_qty: 100, status: 'Closed' };

    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [MOCK_LINE_1], rowCount: 1 } as QueryResult)
        // 0 remaining open lines
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [closedLine], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    await svc.closePOLine('line-uuid-1', 100);

    // Verify PO was set to Closed
    const poUpdateCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(poUpdateCall[0]).toContain('UPDATE purchase_orders');
    expect(poUpdateCall[1][0]).toBe('Closed');
  });

  it('transitions PO to PartiallyClosed when some lines remain open', async () => {
    const closedLine: POLineRow = { ...MOCK_LINE_1, received_qty: 100, status: 'Closed' };

    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [MOCK_LINE_1], rowCount: 1 } as QueryResult)
        // 1 remaining open line
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [closedLine], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(db, dbRead);
    await svc.closePOLine('line-uuid-1', 100);

    // Verify PO was set to PartiallyClosed
    const poUpdateCall = (db.query as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(poUpdateCall[0]).toContain('UPDATE purchase_orders');
    expect(poUpdateCall[1][0]).toBe('PartiallyClosed');
  });

  it('throws RECEIVED_QTY_EXCEEDS_ORDERED when received qty exceeds ordered qty (Property 5)', async () => {
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [MOCK_LINE_1], rowCount: 1 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(makePool(), dbRead);
    // Ordered 100, trying to receive 150
    await expect(svc.closePOLine('line-uuid-1', 150)).rejects.toThrow(
      'RECEIVED_QTY_EXCEEDS_ORDERED',
    );
  });

  it('throws PO_LINE_NOT_FOUND when line does not exist', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(makePool(), dbRead);
    await expect(svc.closePOLine('nonexistent-line', 10)).rejects.toThrow('PO_LINE_NOT_FOUND');
  });
});

// ─── getPOStatus ──────────────────────────────────────────────────────────────

describe('POService.getPOStatus', () => {
  it('returns PO with all lines and current status', async () => {
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [MOCK_PO], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [MOCK_LINE_1, MOCK_LINE_2], rowCount: 2 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(makePool(), dbRead);
    const result = await svc.getPOStatus('po-uuid-1');

    expect(result.po_id).toBe('po-uuid-1');
    expect(result.status).toBe('Open');
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.sku_id).toBe('sku-uuid-1');
    expect(result.lines[1]!.sku_id).toBe('sku-uuid-2');
  });

  it('throws PO_NOT_FOUND when PO does not exist', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult),
    } as unknown as Pool;

    const svc = new POService(makePool(), dbRead);
    await expect(svc.getPOStatus('nonexistent-po')).rejects.toThrow('PO_NOT_FOUND');
  });
});
