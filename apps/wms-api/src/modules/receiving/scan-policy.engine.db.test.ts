import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { ScanPolicyEngine, DEFAULT_SCAN_POLICY_CONFIG } from './scan-policy.engine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a minimal QueryResult with the given rows.
 */
function makeQueryResult<T>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

// ─── loadPolicyConfig ─────────────────────────────────────────────────────────

describe('loadPolicyConfig', () => {
  it('returns DEFAULT_SCAN_POLICY_CONFIG when no row exists in system_config', async () => {
    const mockQuery = vi.fn().mockResolvedValue(makeQueryResult([]));
    const mockPool = { query: mockQuery } as unknown as Pool;
    const engine = new ScanPolicyEngine(mockPool, mockPool);

    const result = await engine.loadPolicyConfig('dc-001');

    expect(result).toEqual(DEFAULT_SCAN_POLICY_CONFIG);
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it('returns parsed config when a row exists in system_config', async () => {
    const customConfig = {
      ...DEFAULT_SCAN_POLICY_CONFIG,
      low_confidence_threshold: 70,
      low_confidence_multiplier: 2.0,
    };
    const mockQuery = vi.fn().mockResolvedValue(
      makeQueryResult([{ param_value: JSON.stringify(customConfig) }]),
    );
    const mockPool = { query: mockQuery } as unknown as Pool;
    const engine = new ScanPolicyEngine(mockPool, mockPool);

    const result = await engine.loadPolicyConfig('dc-001');

    expect(result).toEqual(customConfig);
    expect(result.low_confidence_threshold).toBe(70);
    expect(result.low_confidence_multiplier).toBe(2.0);
  });

  it('returns DEFAULT_SCAN_POLICY_CONFIG when the stored JSON is malformed', async () => {
    const mockQuery = vi.fn().mockResolvedValue(
      makeQueryResult([{ param_value: 'not-valid-json{{{' }]),
    );
    const mockPool = { query: mockQuery } as unknown as Pool;
    const engine = new ScanPolicyEngine(mockPool, mockPool);

    const result = await engine.loadPolicyConfig('dc-001');

    expect(result).toEqual(DEFAULT_SCAN_POLICY_CONFIG);
  });
});

// ─── computePolicy ────────────────────────────────────────────────────────────

describe('computePolicy', () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockPool: Pool;
  let engine: ScanPolicyEngine;

  beforeEach(() => {
    mockQuery = vi.fn();
    mockPool = { query: mockQuery } as unknown as Pool;
    engine = new ScanPolicyEngine(mockPool, mockPool);
  });

  it('throws LINE_NOT_FOUND when the line does not exist', async () => {
    // First query (line lookup) returns empty rows
    mockQuery.mockResolvedValueOnce(makeQueryResult([]));

    await expect(engine.computePolicy('nonexistent-line', 'dc-001')).rejects.toThrow(
      'LINE_NOT_FOUND',
    );
  });

  it('throws UNKNOWN_PACKAGING_CLASS when the SKU has an unrecognised packaging class', async () => {
    // First query (line lookup) returns a row with an invalid packaging class
    mockQuery.mockResolvedValueOnce(
      makeQueryResult([
        {
          packaging_class: 'InvalidClass',
          batch_size: 10,
          requires_cold: false,
          vendor_id: 'vendor-1',
          asn_id: 'asn-1',
        },
      ]),
    );

    await expect(engine.computePolicy('line-1', 'dc-001')).rejects.toThrow(
      'UNKNOWN_PACKAGING_CLASS',
    );
  });
});
