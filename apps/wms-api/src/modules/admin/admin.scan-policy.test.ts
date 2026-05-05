import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { AdminService, isValidModifier } from './admin.service.js';
import type { ScanPolicyConfig } from '../receiving/scan-policy.engine.js';
import { DEFAULT_SCAN_POLICY_CONFIG } from '../receiving/scan-policy.engine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal ScanPolicyConfig with an optional sampling_modifier on each
 * packaging class entry (used to exercise the modifier validation path).
 */
function makePolicyWithModifier(modifier: number): ScanPolicyConfig & {
  packaging_classes: Record<string, { sampling_modifier: number } & ScanPolicyConfig['packaging_classes'][keyof ScanPolicyConfig['packaging_classes']]>;
} {
  return {
    ...DEFAULT_SCAN_POLICY_CONFIG,
    packaging_classes: {
      SealedCarton: {
        ...DEFAULT_SCAN_POLICY_CONFIG.packaging_classes.SealedCarton,
        sampling_modifier: modifier,
      },
      GunnyBag: {
        ...DEFAULT_SCAN_POLICY_CONFIG.packaging_classes.GunnyBag,
        sampling_modifier: modifier,
      },
      Rice: {
        ...DEFAULT_SCAN_POLICY_CONFIG.packaging_classes.Rice,
        sampling_modifier: modifier,
      },
      ShrinkWrap: {
        ...DEFAULT_SCAN_POLICY_CONFIG.packaging_classes.ShrinkWrap,
        sampling_modifier: modifier,
      },
      Loose: {
        ...DEFAULT_SCAN_POLICY_CONFIG.packaging_classes.Loose,
        sampling_modifier: modifier,
      },
      MixedLoad: {
        ...DEFAULT_SCAN_POLICY_CONFIG.packaging_classes.MixedLoad,
        sampling_modifier: modifier,
      },
    },
  } as any;
}

// ─── Mock Pool factory ────────────────────────────────────────────────────────

function makePool(overrides: Partial<Record<string, unknown>> = {}): Pool {
  const queryMock = vi.fn().mockImplementation(async (sql: string) => {
    // SELECT param_value (getParam / updateConfig prev-value fetch)
    if (typeof sql === 'string' && sql.includes('SELECT param_value')) {
      return { rows: [] } as unknown as QueryResult;
    }
    // INSERT … ON CONFLICT (updateConfig upsert)
    if (typeof sql === 'string' && sql.includes('INSERT INTO system_config')) {
      return {
        rows: [
          {
            config_id: 'cfg-1',
            dc_id: 'DC1',
            param_key: 'packaging_class_scan_policy',
            param_value: '{}',
            updated_by: 'user1',
            updated_at: new Date().toISOString(),
            reason_code: 'test',
          },
        ],
      } as unknown as QueryResult;
    }
    // INSERT INTO audit_events
    if (typeof sql === 'string' && sql.includes('INSERT INTO audit_events')) {
      return { rows: [] } as unknown as QueryResult;
    }
    return { rows: [] } as unknown as QueryResult;
  });

  return { query: queryMock, ...overrides } as unknown as Pool;
}

// ─── isValidModifier unit tests ───────────────────────────────────────────────

describe('isValidModifier', () => {
  it('returns false for modifier below 0.5', () => {
    expect(isValidModifier(0.4)).toBe(false);
    expect(isValidModifier(0.0)).toBe(false);
    expect(isValidModifier(-1)).toBe(false);
  });

  it('returns false for modifier above 5.0', () => {
    expect(isValidModifier(5.1)).toBe(false);
    expect(isValidModifier(10)).toBe(false);
  });

  it('returns true for boundary value 0.5', () => {
    expect(isValidModifier(0.5)).toBe(true);
  });

  it('returns true for boundary value 5.0', () => {
    expect(isValidModifier(5.0)).toBe(true);
  });

  it('returns true for values strictly inside the range', () => {
    expect(isValidModifier(1.0)).toBe(true);
    expect(isValidModifier(2.5)).toBe(true);
    expect(isValidModifier(4.99)).toBe(true);
  });
});

// ─── updateScanPolicy unit tests ──────────────────────────────────────────────

describe('AdminService.updateScanPolicy', () => {
  let service: AdminService;
  let pool: Pool;

  beforeEach(() => {
    pool = makePool();
    service = new AdminService(pool);
  });

  it('rejects modifier 0.4 with INVALID_MODIFIER_RANGE', async () => {
    const policy = makePolicyWithModifier(0.4);
    await expect(
      service.updateScanPolicy('DC1', policy as any, 'reason', 'user1', 'device1'),
    ).rejects.toMatchObject({ code: 'INVALID_MODIFIER_RANGE' });
  });

  it('rejects modifier 5.1 with INVALID_MODIFIER_RANGE', async () => {
    const policy = makePolicyWithModifier(5.1);
    await expect(
      service.updateScanPolicy('DC1', policy as any, 'reason', 'user1', 'device1'),
    ).rejects.toMatchObject({ code: 'INVALID_MODIFIER_RANGE' });
  });

  it('accepts boundary modifier 0.5 without throwing', async () => {
    const policy = makePolicyWithModifier(0.5);
    await expect(
      service.updateScanPolicy('DC1', policy as any, 'reason', 'user1', 'device1'),
    ).resolves.toBeDefined();
  });

  it('accepts boundary modifier 5.0 without throwing', async () => {
    const policy = makePolicyWithModifier(5.0);
    await expect(
      service.updateScanPolicy('DC1', policy as any, 'reason', 'user1', 'device1'),
    ).resolves.toBeDefined();
  });

  it('returns the saved policy on success', async () => {
    const policy = makePolicyWithModifier(1.0);
    const result = await service.updateScanPolicy('DC1', policy as any, 'reason', 'user1', 'device1');
    expect(result).toEqual(policy);
  });

  it('accepts a standard ScanPolicyConfig with no sampling_modifier fields', async () => {
    // DEFAULT_SCAN_POLICY_CONFIG has no sampling_modifier — should pass validation
    await expect(
      service.updateScanPolicy('DC1', DEFAULT_SCAN_POLICY_CONFIG, 'reason', 'user1', 'device1'),
    ).resolves.toEqual(DEFAULT_SCAN_POLICY_CONFIG);
  });
});

// ─── getScanPolicy unit tests ─────────────────────────────────────────────────

describe('AdminService.getScanPolicy', () => {
  it('returns DEFAULT_SCAN_POLICY_CONFIG when no row exists', async () => {
    const pool = makePool();
    const service = new AdminService(pool);
    const result = await service.getScanPolicy('DC1');
    expect(result).toEqual(DEFAULT_SCAN_POLICY_CONFIG);
  });

  it('returns the stored policy when a row exists', async () => {
    const stored = { ...DEFAULT_SCAN_POLICY_CONFIG, low_confidence_threshold: 75 };
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ param_value: JSON.stringify(stored) }],
    } as unknown as QueryResult);
    const pool = { query: queryMock } as unknown as Pool;
    const service = new AdminService(pool);
    const result = await service.getScanPolicy('DC1');
    expect(result).toEqual(stored);
  });

  it('falls back to DEFAULT_SCAN_POLICY_CONFIG when stored JSON is malformed', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ param_value: 'not-valid-json{{{' }],
    } as unknown as QueryResult);
    const pool = { query: queryMock } as unknown as Pool;
    const service = new AdminService(pool);
    const result = await service.getScanPolicy('DC1');
    expect(result).toEqual(DEFAULT_SCAN_POLICY_CONFIG);
  });
});

// ─── getComplianceSummary unit tests ──────────────────────────────────────────

describe('AdminService.getComplianceSummary', () => {
  it('returns correct counts and averages for a known dataset', async () => {
    const mockRows = [
      {
        vendor_id: 'V1',
        vendor_name: 'Acme Corp',
        delivery_count: 3,
        override_count: 1,
        avg_scan_compliance_pct: 85.5,
      },
      {
        vendor_id: 'V2',
        vendor_name: 'Beta Ltd',
        delivery_count: 5,
        override_count: 0,
        avg_scan_compliance_pct: 100,
      },
    ];

    const queryMock = vi.fn().mockResolvedValue({
      rows: mockRows,
    } as unknown as QueryResult);
    const pool = { query: queryMock } as unknown as Pool;
    const service = new AdminService(pool);

    const result = await service.getComplianceSummary('DC1', '2024-01-01', '2024-02-01');

    expect(result).toHaveLength(2);

    const acme = result.find((r) => r.vendor_id === 'V1')!;
    expect(acme.vendor_name).toBe('Acme Corp');
    expect(acme.delivery_count).toBe(3);
    expect(acme.override_count).toBe(1);
    expect(acme.avg_scan_compliance_pct).toBe(85.5);

    const beta = result.find((r) => r.vendor_id === 'V2')!;
    expect(beta.delivery_count).toBe(5);
    expect(beta.override_count).toBe(0);
    expect(beta.avg_scan_compliance_pct).toBe(100);
  });

  it('returns an empty array when no deliveries match', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [],
    } as unknown as QueryResult);
    const pool = { query: queryMock } as unknown as Pool;
    const service = new AdminService(pool);

    const result = await service.getComplianceSummary('DC1', '2024-01-01', '2024-02-01');
    expect(result).toEqual([]);
  });

  it('passes dc_id, fromDate, toDate as query parameters', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] } as unknown as QueryResult);
    const pool = { query: queryMock } as unknown as Pool;
    const service = new AdminService(pool);

    await service.getComplianceSummary('DC_TEST', '2024-03-01', '2024-04-01');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE d.dc_id = $1'),
      ['DC_TEST', '2024-03-01', '2024-04-01'],
    );
  });
});
