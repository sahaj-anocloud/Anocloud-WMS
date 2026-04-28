import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VendorService } from './vendor.service.js';
import type { Pool, QueryResult } from 'pg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult),
  } as unknown as Pool;
}

const VALID_GSTIN = 'ABCDE1234F5Z6G7'; // 15 alphanumeric uppercase chars

const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE = '2099-12-31';
const PAST = '2000-01-01';

// ─── createVendor ─────────────────────────────────────────────────────────────

describe('VendorService.createVendor', () => {
  it('rejects GSTIN shorter than 15 chars', async () => {
    const db = makePool();
    const svc = new VendorService(db, db);
    await expect(
      svc.createVendor('DC01', { vendor_code: 'V001', name: 'Test', gstin: 'SHORT' }),
    ).rejects.toThrow('INVALID_GSTIN');
  });

  it('rejects GSTIN longer than 15 chars', async () => {
    const db = makePool();
    const svc = new VendorService(db, db);
    await expect(
      svc.createVendor('DC01', { vendor_code: 'V001', name: 'Test', gstin: 'ABCDE1234F5Z6G78' }),
    ).rejects.toThrow('INVALID_GSTIN');
  });

  it('rejects GSTIN with special characters', async () => {
    const db = makePool();
    const svc = new VendorService(db, db);
    await expect(
      svc.createVendor('DC01', { vendor_code: 'V001', name: 'Test', gstin: 'ABCDE1234F5Z6G!' }),
    ).rejects.toThrow('INVALID_GSTIN');
  });

  it('rejects GSTIN with lowercase letters', async () => {
    const db = makePool();
    const svc = new VendorService(db, db);
    await expect(
      svc.createVendor('DC01', { vendor_code: 'V001', name: 'Test', gstin: 'abcde1234f5z6g7' }),
    ).rejects.toThrow('INVALID_GSTIN');
  });

  it('accepts a valid 15-char alphanumeric GSTIN and inserts vendor in Pending status', async () => {
    const vendorRow = {
      vendor_id: 'uuid-1',
      dc_id: 'DC01',
      vendor_code: 'V001',
      name: 'Test Vendor',
      gstin: VALID_GSTIN,
      compliance_status: 'Pending',
      created_at: TODAY,
      updated_at: TODAY,
    };
    const db = makePool([vendorRow]);
    const svc = new VendorService(db, db);

    const result = await svc.createVendor('DC01', {
      vendor_code: 'V001',
      name: 'Test Vendor',
      gstin: VALID_GSTIN,
    });

    expect(result.compliance_status).toBe('Pending');
    expect(result.gstin).toBe(VALID_GSTIN);
  });
});

// ─── approveVendor ────────────────────────────────────────────────────────────

describe('VendorService.approveVendor', () => {
  function makeReadPool(
    complianceStatus: string,
    docs: { doc_type: string; expiry_date: string | null }[],
  ): Pool {
    return {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ compliance_status: complianceStatus }],
          rowCount: 1,
        } as QueryResult)
        .mockResolvedValueOnce({ rows: docs, rowCount: docs.length } as QueryResult),
    } as unknown as Pool;
  }

  it('throws when GSTIN doc is missing', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'FSSAI', expiry_date: FUTURE },
      { doc_type: 'KYC', expiry_date: FUTURE },
    ]);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'MISSING_MANDATORY_DOCS',
    );
  });

  it('throws when FSSAI doc is missing', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: FUTURE },
      { doc_type: 'KYC', expiry_date: FUTURE },
    ]);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'MISSING_MANDATORY_DOCS',
    );
  });

  it('throws when KYC doc is missing', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: FUTURE },
      { doc_type: 'FSSAI', expiry_date: FUTURE },
    ]);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'MISSING_MANDATORY_DOCS',
    );
  });

  it('throws when all docs are missing', async () => {
    const dbRead = makeReadPool('Pending', []);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'MISSING_MANDATORY_DOCS',
    );
  });

  it('throws when GSTIN doc is expired', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: PAST },
      { doc_type: 'FSSAI', expiry_date: FUTURE },
      { doc_type: 'KYC', expiry_date: FUTURE },
    ]);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'EXPIRED_MANDATORY_DOCS',
    );
  });

  it('throws when FSSAI doc is expired', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: FUTURE },
      { doc_type: 'FSSAI', expiry_date: PAST },
      { doc_type: 'KYC', expiry_date: FUTURE },
    ]);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'EXPIRED_MANDATORY_DOCS',
    );
  });

  it('throws when KYC doc is expired', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: FUTURE },
      { doc_type: 'FSSAI', expiry_date: FUTURE },
      { doc_type: 'KYC', expiry_date: PAST },
    ]);
    const db = makePool([]);
    const svc = new VendorService(db, dbRead);

    await expect(svc.approveVendor('v1', 'approver', 'device', 'DC01')).rejects.toThrow(
      'EXPIRED_MANDATORY_DOCS',
    );
  });

  it('succeeds and returns Active vendor when all 3 docs are present and non-expired', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: FUTURE },
      { doc_type: 'FSSAI', expiry_date: FUTURE },
      { doc_type: 'KYC', expiry_date: FUTURE },
    ]);

    const activeVendor = {
      vendor_id: 'v1',
      dc_id: 'DC01',
      vendor_code: 'V001',
      name: 'Test',
      gstin: VALID_GSTIN,
      compliance_status: 'Active',
      created_at: TODAY,
      updated_at: TODAY,
    };

    // db is used for UPDATE vendors + writeAuditEvent INSERT
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [activeVendor], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult), // audit insert
    } as unknown as Pool;

    const svc = new VendorService(db, dbRead);
    const result = await svc.approveVendor('v1', 'approver', 'device', 'DC01');

    expect(result.compliance_status).toBe('Active');
  });

  it('accepts docs with null expiry_date (no-expiry documents)', async () => {
    const dbRead = makeReadPool('Pending', [
      { doc_type: 'GSTIN', expiry_date: null },
      { doc_type: 'FSSAI', expiry_date: null },
      { doc_type: 'KYC', expiry_date: null },
    ]);

    const activeVendor = {
      vendor_id: 'v1',
      compliance_status: 'Active',
    };

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [activeVendor], rowCount: 1 } as QueryResult)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult),
    } as unknown as Pool;

    const svc = new VendorService(db, dbRead);
    const result = await svc.approveVendor('v1', 'approver', 'device', 'DC01');

    expect(result.compliance_status).toBe('Active');
  });
});

// ─── getComplianceStatus ──────────────────────────────────────────────────────

describe('VendorService.getComplianceStatus', () => {
  it('returns empty missing/expired lists when all 3 docs are present and non-expired', async () => {
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ compliance_status: 'Active' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { doc_type: 'GSTIN', expiry_date: FUTURE },
            { doc_type: 'FSSAI', expiry_date: FUTURE },
            { doc_type: 'KYC', expiry_date: FUTURE },
          ],
          rowCount: 3,
        }),
    } as unknown as Pool;

    const svc = new VendorService(dbRead, dbRead);
    const result = await svc.getComplianceStatus('v1');

    expect(result.missing_docs).toEqual([]);
    expect(result.expired_docs).toEqual([]);
  });

  it('lists all three docs as missing when no documents exist', async () => {
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ compliance_status: 'Pending' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const svc = new VendorService(dbRead, dbRead);
    const result = await svc.getComplianceStatus('v1');

    expect(result.missing_docs).toEqual(expect.arrayContaining(['GSTIN', 'FSSAI', 'KYC']));
    expect(result.missing_docs).toHaveLength(3);
  });

  it('lists only the missing doc when two of three are present', async () => {
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ compliance_status: 'Pending' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { doc_type: 'GSTIN', expiry_date: FUTURE },
            { doc_type: 'FSSAI', expiry_date: FUTURE },
          ],
          rowCount: 2,
        }),
    } as unknown as Pool;

    const svc = new VendorService(dbRead, dbRead);
    const result = await svc.getComplianceStatus('v1');

    expect(result.missing_docs).toEqual(['KYC']);
    expect(result.expired_docs).toEqual([]);
  });

  it('lists expired docs separately from missing docs', async () => {
    const dbRead = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ compliance_status: 'Pending' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { doc_type: 'GSTIN', expiry_date: PAST },
            { doc_type: 'FSSAI', expiry_date: FUTURE },
            // KYC missing
          ],
          rowCount: 2,
        }),
    } as unknown as Pool;

    const svc = new VendorService(dbRead, dbRead);
    const result = await svc.getComplianceStatus('v1');

    expect(result.missing_docs).toEqual(['KYC']);
    expect(result.expired_docs).toEqual(['GSTIN']);
  });

  it('throws VENDOR_NOT_FOUND when vendor does not exist', async () => {
    const dbRead = {
      query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const svc = new VendorService(dbRead, dbRead);
    await expect(svc.getComplianceStatus('nonexistent')).rejects.toThrow('VENDOR_NOT_FOUND');
  });
});
