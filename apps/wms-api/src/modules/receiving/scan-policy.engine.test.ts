import { describe, it, expect } from 'vitest';
import { ScanPolicyEngine, VALID_PACKAGING_CLASSES } from './scan-policy.engine.js';
import type { Pool } from 'pg';

// Minimal stub Pool — pure functions don't use DB
const stubPool = {} as Pool;

const engine = new ScanPolicyEngine(stubPool, stubPool);

// ─── calculateBaseCount ───────────────────────────────────────────────────────

describe('calculateBaseCount', () => {
  describe('SealedCarton — MAX(1, CEIL(batchSize * 0.05))', () => {
    it('returns 1 for batchSize=0 (minimum floor)', () => {
      expect(engine.calculateBaseCount('SealedCarton', 0)).toBe(1);
    });

    it('returns 1 for batchSize=1', () => {
      expect(engine.calculateBaseCount('SealedCarton', 1)).toBe(1);
    });

    it('returns 1 for batchSize=20 (0.05 * 20 = 1.0 → ceil = 1)', () => {
      expect(engine.calculateBaseCount('SealedCarton', 20)).toBe(1);
    });

    it('returns 2 for batchSize=21 (0.05 * 21 = 1.05 → ceil = 2)', () => {
      expect(engine.calculateBaseCount('SealedCarton', 21)).toBe(2);
    });

    it('returns 5 for batchSize=100 (0.05 * 100 = 5)', () => {
      expect(engine.calculateBaseCount('SealedCarton', 100)).toBe(5);
    });

    it('returns 10 for batchSize=200', () => {
      expect(engine.calculateBaseCount('SealedCarton', 200)).toBe(10);
    });
  });

  describe('GunnyBag — always 1', () => {
    it('returns 1 for batchSize=0', () => {
      expect(engine.calculateBaseCount('GunnyBag', 0)).toBe(1);
    });

    it('returns 1 for batchSize=1', () => {
      expect(engine.calculateBaseCount('GunnyBag', 1)).toBe(1);
    });

    it('returns 1 for batchSize=500', () => {
      expect(engine.calculateBaseCount('GunnyBag', 500)).toBe(1);
    });
  });

  describe('Rice — always 1', () => {
    it('returns 1 for batchSize=0', () => {
      expect(engine.calculateBaseCount('Rice', 0)).toBe(1);
    });

    it('returns 1 for batchSize=1', () => {
      expect(engine.calculateBaseCount('Rice', 1)).toBe(1);
    });

    it('returns 1 for batchSize=1000', () => {
      expect(engine.calculateBaseCount('Rice', 1000)).toBe(1);
    });
  });

  describe('ShrinkWrap — equals batchSize', () => {
    it('returns 0 for batchSize=0', () => {
      expect(engine.calculateBaseCount('ShrinkWrap', 0)).toBe(0);
    });

    it('returns 1 for batchSize=1', () => {
      expect(engine.calculateBaseCount('ShrinkWrap', 1)).toBe(1);
    });

    it('returns 50 for batchSize=50', () => {
      expect(engine.calculateBaseCount('ShrinkWrap', 50)).toBe(50);
    });
  });

  describe('Loose — batchSize + 1', () => {
    it('returns 1 for batchSize=0', () => {
      expect(engine.calculateBaseCount('Loose', 0)).toBe(1);
    });

    it('returns 2 for batchSize=1', () => {
      expect(engine.calculateBaseCount('Loose', 1)).toBe(2);
    });

    it('returns 21 for batchSize=20', () => {
      expect(engine.calculateBaseCount('Loose', 20)).toBe(21);
    });
  });

  describe('MixedLoad — same formula as SealedCarton', () => {
    it('returns 1 for batchSize=0', () => {
      expect(engine.calculateBaseCount('MixedLoad', 0)).toBe(1);
    });

    it('returns 1 for batchSize=20', () => {
      expect(engine.calculateBaseCount('MixedLoad', 20)).toBe(1);
    });

    it('returns 2 for batchSize=21', () => {
      expect(engine.calculateBaseCount('MixedLoad', 21)).toBe(2);
    });

    it('returns 5 for batchSize=100', () => {
      expect(engine.calculateBaseCount('MixedLoad', 100)).toBe(5);
    });
  });

  describe('UNKNOWN_PACKAGING_CLASS error', () => {
    it('throws for an unrecognised class string', () => {
      expect(() =>
        engine.calculateBaseCount('Pallet' as any, 10),
      ).toThrow('UNKNOWN_PACKAGING_CLASS');
    });

    it('throws for an empty string', () => {
      expect(() =>
        engine.calculateBaseCount('' as any, 10),
      ).toThrow('UNKNOWN_PACKAGING_CLASS');
    });

    it('throws for a lowercase variant', () => {
      expect(() =>
        engine.calculateBaseCount('sealedcarton' as any, 10),
      ).toThrow('UNKNOWN_PACKAGING_CLASS');
    });

    it('attaches code UNKNOWN_PACKAGING_CLASS to the thrown error', () => {
      let caught: unknown;
      try {
        engine.calculateBaseCount('Unknown' as any, 10);
      } catch (e) {
        caught = e;
      }
      expect((caught as any).code).toBe('UNKNOWN_PACKAGING_CLASS');
    });
  });
});

// ─── applyMultipliers ─────────────────────────────────────────────────────────

describe('applyMultipliers', () => {
  it('returns base unchanged when modifier=1.0 and confidence=1.0', () => {
    expect(engine.applyMultipliers(5, 1.0, 1.0)).toBe(5);
    expect(engine.applyMultipliers(0, 1.0, 1.0)).toBe(0);
    expect(engine.applyMultipliers(1, 1.0, 1.0)).toBe(1);
  });

  it('doubles and rounds up correctly with modifier=2.0', () => {
    expect(engine.applyMultipliers(5, 2.0, 1.0)).toBe(10);
    expect(engine.applyMultipliers(3, 2.0, 1.0)).toBe(6);
  });

  it('rounds up fractional results (CEIL)', () => {
    // 5 * 1.5 = 7.5 → ceil = 8
    expect(engine.applyMultipliers(5, 1.5, 1.0)).toBe(8);
    // 3 * 1.3 = 3.9 → ceil = 4
    expect(engine.applyMultipliers(3, 1.3, 1.0)).toBe(4);
  });

  it('applies both samplingModifier and confidenceMultiplier', () => {
    // 5 * 2.0 * 1.5 = 15
    expect(engine.applyMultipliers(5, 2.0, 1.5)).toBe(15);
  });

  it('guarantees result >= base (non-reduction invariant)', () => {
    // Even with modifier < 1 (edge case), result should be >= base
    expect(engine.applyMultipliers(10, 0.5, 1.0)).toBeGreaterThanOrEqual(10);
  });

  it('returns base when base=0 regardless of multipliers', () => {
    expect(engine.applyMultipliers(0, 2.0, 1.5)).toBe(0);
  });
});

// ─── VALID_PACKAGING_CLASSES set ─────────────────────────────────────────────

describe('VALID_PACKAGING_CLASSES', () => {
  it('contains exactly 6 values', () => {
    expect(VALID_PACKAGING_CLASSES.size).toBe(6);
  });

  it('contains all expected packaging classes', () => {
    const expected = ['SealedCarton', 'GunnyBag', 'Rice', 'ShrinkWrap', 'Loose', 'MixedLoad'];
    for (const cls of expected) {
      expect(VALID_PACKAGING_CLASSES.has(cls as any)).toBe(true);
    }
  });
});
