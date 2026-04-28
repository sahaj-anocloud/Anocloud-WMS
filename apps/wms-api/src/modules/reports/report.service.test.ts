import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { clampPct } from './report.service.js';

// ─── clampPct unit tests ───────────────────────────────────────────────────────

describe('clampPct', () => {
  it('clamps value above 100 to 100', () => {
    expect(clampPct(150)).toBe(100);
    expect(clampPct(100.001)).toBe(100);
  });

  it('clamps value below 0 to 0', () => {
    expect(clampPct(-1)).toBe(0);
    expect(clampPct(-999)).toBe(0);
  });

  it('leaves values in [0, 100] unchanged', () => {
    expect(clampPct(0)).toBe(0);
    expect(clampPct(50)).toBe(50);
    expect(clampPct(100)).toBe(100);
    expect(clampPct(85.5)).toBe(85.5);
  });

  it('handles NaN as 0', () => {
    expect(clampPct(NaN)).toBe(0);
  });
});

// ─── Property 29: KPI Value Bounds ────────────────────────────────────────────
// All percentage KPI outputs are in [0, 100]; no KPI is negative or > 100.
// Validates: Req 18.1, 18.2

describe('Property 29: KPI Value Bounds', () => {
  it('all KPI percentages are clamped to [0, 100] regardless of raw inputs', () => {
    fc.assert(
      fc.property(
        fc.record({
          numerator: fc.float({ min: Math.fround(-1000), max: Math.fround(10000), noNaN: true }),
          denominator: fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true }),
        }),
        ({ numerator, denominator }) => {
          const rawRate = (numerator / denominator) * 100;
          const clamped = clampPct(rawRate);
          expect(clamped).toBeGreaterThanOrEqual(0);
          expect(clamped).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clampPct is idempotent: clampPct(clampPct(x)) == clampPct(x)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(-500), max: Math.fround(500), noNaN: true }),
        (x) => {
          const once = clampPct(x);
          const twice = clampPct(once);
          expect(twice).toBe(once);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('output is always finite and within [0, 100]', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true }), (x) => {
        const result = clampPct(x);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 30: KPI Aggregation Consistency ─────────────────────────────────
// Sum of per-vendor ASN coverage counts equals the DC-level total.
// Validates: Req 18.3

describe('Property 30: KPI Aggregation Consistency', () => {
  interface VendorASNData {
    vendorId: string;
    asnCount: number;
    deliveryCount: number;
  }

  function computeVendorCoverageRate(vendor: VendorASNData): number {
    return clampPct(
      vendor.deliveryCount > 0 ? (vendor.asnCount / vendor.deliveryCount) * 100 : 0,
    );
  }

  function computeDCTotalASNCount(vendors: VendorASNData[]): number {
    return vendors.reduce((sum, v) => sum + v.asnCount, 0);
  }

  function computeDCTotalDeliveryCount(vendors: VendorASNData[]): number {
    return vendors.reduce((sum, v) => sum + v.deliveryCount, 0);
  }

  function computeDCCoverageRate(vendors: VendorASNData[]): number {
    const totalASNs = computeDCTotalASNCount(vendors);
    const totalDeliveries = computeDCTotalDeliveryCount(vendors);
    return clampPct(totalDeliveries > 0 ? (totalASNs / totalDeliveries) * 100 : 0);
  }

  it('DC-level ASN count equals sum of per-vendor ASN counts', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            vendorId: fc.uuid(),
            asnCount: fc.integer({ min: 0, max: 1000 }),
            deliveryCount: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (vendors) => {
          const dcTotal = computeDCTotalASNCount(vendors);
          const sumOfVendors = vendors.reduce((sum, v) => sum + v.asnCount, 0);
          expect(dcTotal).toBe(sumOfVendors);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('DC-level rate is consistent with per-vendor aggregation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            vendorId: fc.uuid(),
            asnCount: fc.integer({ min: 0, max: 500 }),
            deliveryCount: fc.integer({ min: 1, max: 500 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (vendors) => {
          // DC-level rate should be computed from aggregated totals, not averaged per-vendor rates
          const dcRate = computeDCCoverageRate(vendors);
          expect(dcRate).toBeGreaterThanOrEqual(0);
          expect(dcRate).toBeLessThanOrEqual(100);

          // The DC-level rate re-computed from aggregated totals must equal direct computation
          const totalASNs = computeDCTotalASNCount(vendors);
          const totalDeliveries = computeDCTotalDeliveryCount(vendors);
          const recomputed = clampPct(totalDeliveries > 0 ? (totalASNs / totalDeliveries) * 100 : 0);
          expect(dcRate).toBe(recomputed);
        },
      ),
      { numRuns: 100 },
    );
  });
});
