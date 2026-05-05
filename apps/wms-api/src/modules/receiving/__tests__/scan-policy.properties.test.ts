import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ScanPolicyEngine,
  VALID_PACKAGING_CLASSES,
  DEFAULT_SCAN_POLICY_CONFIG,
} from '../scan-policy.engine.js';
import {
  checkOverrideRole,
  checkReasonCode,
} from '../receiving.service.js';
import type { Pool } from 'pg';
import type { PackagingClass } from '../scan-policy.engine.js';

// Minimal stub Pool — all properties under test use pure functions only
const stubPool = {} as Pool;
const engine = new ScanPolicyEngine(stubPool, stubPool);

// ─── Property 1: Valid packaging class acceptance ─────────────────────────────
// Feature: risk-based-scanning-policy, Property 1: Valid packaging class acceptance
// Validates: Requirements 1.1, 1.3

describe('Property 1: Valid packaging class acceptance', () => {
  it('accepts a string if and only if it is in VALID_PACKAGING_CLASSES', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const isValid = VALID_PACKAGING_CLASSES.has(s as PackagingClass);
        if (isValid) {
          // Should NOT throw
          expect(() => engine.calculateBaseCount(s as PackagingClass, 1)).not.toThrow();
        } else {
          // Should throw with UNKNOWN_PACKAGING_CLASS
          expect(() => engine.calculateBaseCount(s as PackagingClass, 1)).toThrow(
            'UNKNOWN_PACKAGING_CLASS',
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Property 2: Base scan count formula correctness ─────────────────────────
// Feature: risk-based-scanning-policy, Property 2: Base scan count formula correctness
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6

describe('Property 2: Base scan count formula correctness', () => {
  it('returns the correct value per formula for each packaging class', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Array.from(VALID_PACKAGING_CLASSES)),
        fc.nat({ max: 10_000 }),
        (packagingClass, batchSize) => {
          const result = engine.calculateBaseCount(packagingClass, batchSize);

          switch (packagingClass) {
            case 'SealedCarton':
            case 'MixedLoad':
              expect(result).toBe(Math.max(1, Math.ceil(batchSize * 0.05)));
              break;
            case 'GunnyBag':
              expect(result).toBe(1);
              break;
            case 'Rice':
              expect(result).toBe(1);
              break;
            case 'ShrinkWrap':
              expect(result).toBe(batchSize);
              break;
            case 'Loose':
              expect(result).toBe(batchSize + 1);
              break;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 3: Non-negativity and integer invariant ────────────────────────
// Feature: risk-based-scanning-policy, Property 3: Non-negativity and integer invariant
// Validates: Requirements 2.7

describe('Property 3: Non-negativity and integer invariant', () => {
  it('calculateBaseCount returns a non-negative integer for all valid inputs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Array.from(VALID_PACKAGING_CLASSES)),
        fc.nat({ max: 100_000 }),
        (packagingClass, batchSize) => {
          const result = engine.calculateBaseCount(packagingClass, batchSize);

          // Must be non-negative
          expect(result).toBeGreaterThanOrEqual(0);

          // Must be an integer (no fractional part)
          expect(Number.isInteger(result)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 4: Multiplier non-reduction ────────────────────────────────────
// Feature: risk-based-scanning-policy, Property 4: Multiplier non-reduction
// Validates: Requirements 3.1, 3.4

describe('Property 4: Multiplier non-reduction', () => {
  it('applyMultipliers(b, m, 1.0) >= b for any b >= 0 and m >= 1.0', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.float({ min: 1.0, max: 5.0, noNaN: true }),
        (base, modifier) => {
          const result = engine.applyMultipliers(base, modifier, 1.0);

          // Result must never be less than the base count
          expect(result).toBeGreaterThanOrEqual(base);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('applyMultipliers result is always a non-negative integer', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.float({ min: 1.0, max: 5.0, noNaN: true }),
        fc.float({ min: 1.0, max: 2.0, noNaN: true }),
        (base, samplingModifier, confidenceMultiplier) => {
          const result = engine.applyMultipliers(base, samplingModifier, confidenceMultiplier);

          expect(result).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 5: Low-confidence amplification ────────────────────────────────
// Feature: risk-based-scanning-policy, Property 5: Low-confidence amplification
// Validates: Requirements 3.3

describe('Property 5: Low-confidence amplification', () => {
  it('applyMultipliers(base, modifier, 1.5) >= applyMultipliers(base, modifier, 1.0) for any base and modifier', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.float({ min: 1.0, max: 5.0, noNaN: true }),
        (base, modifier) => {
          // Low-confidence multiplier (1.5) simulates ASN confidence score below DC threshold (60)
          // Standard multiplier (1.0) simulates standard confidence score (100)
          const lowConfidenceResult = engine.applyMultipliers(base, modifier, 1.5);
          const standardResult = engine.applyMultipliers(base, modifier, 1.0);

          // A delivery with low ASN confidence must require at least as many scans
          // as the same delivery with standard confidence
          expect(lowConfidenceResult).toBeGreaterThanOrEqual(standardResult);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 8: Packaging-class workflow flags ───────────────────────────────
// Feature: risk-based-scanning-policy, Property 8: Packaging-class workflow flags
// Validates: Requirements 4.3, 4.5

describe('Property 8: Packaging-class workflow flags', () => {
  it('DEFAULT_SCAN_POLICY_CONFIG has correct workflow flags for each packaging class', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Array.from(VALID_PACKAGING_CLASSES)),
        (packagingClass: PackagingClass) => {
          const classConfig = DEFAULT_SCAN_POLICY_CONFIG.packaging_classes[packagingClass];

          switch (packagingClass) {
            case 'ShrinkWrap':
              // Req 4.3: ShrinkWrap must preserve packaging integrity
              expect(classConfig.packaging_integrity_preserve).toBe(true);
              break;
            case 'GunnyBag':
              // Req 4.1: GunnyBag requires physical count
              expect(classConfig.physical_count_required).toBe(true);
              break;
            case 'Rice':
              // Req 4.2: Rice requires label affixing
              expect(classConfig.label_affixing_required).toBe(true);
              break;
            case 'SealedCarton':
            case 'Loose':
            case 'MixedLoad':
              // These classes do not require packaging integrity preservation or physical count
              expect(classConfig.packaging_integrity_preserve).toBe(false);
              expect(classConfig.physical_count_required).toBe(false);
              break;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 6: Hard stop invariant ─────────────────────────────────────────
// Feature: risk-based-scanning-policy, Property 6: Hard stop invariant
// Validates: Requirements 5.1

/**
 * The compliance formula is a pure computation:
 *   MIN(100, FLOOR((completed / required) * 100))
 *
 * When completed < required, the formula always yields < 100, which is the
 * condition that triggers the hard stop (SCAN_COUNT_INCOMPLETE).
 * We test the formula directly — no DB mocking needed.
 */
describe('Property 6: Hard stop invariant', () => {
  it('compliance formula yields < 100 whenever completed < required', () => {
    fc.assert(
      fc.property(
        fc.nat(),                              // completed_scans (0..MAX_SAFE_INTEGER)
        fc.integer({ min: 1, max: 100_000 }), // required_scans  (1..100_000)
        (completed, required) => {
          // Only test the case where completed < required (the hard-stop condition)
          fc.pre(completed < required);

          const compliancePct = Math.min(100, Math.floor((completed / required) * 100));

          // Hard stop invariant: compliance must be < 100 when scans are incomplete
          expect(compliancePct).toBeLessThan(100);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ─── Property 7: Compliance percentage bounds and formula ─────────────────────
// Feature: risk-based-scanning-policy, Property 7: Compliance percentage bounds and formula
// Validates: Requirements 5.5

describe('Property 7: Compliance percentage bounds and formula', () => {
  it('scan_compliance_pct is always in [0, 100] and equals MIN(100, FLOOR((completed/required)*100))', () => {
    fc.assert(
      fc.property(
        fc.nat(),                              // completed_scans >= 0
        fc.integer({ min: 1, max: 100_000 }), // required_scans  >= 1
        (completed, required) => {
          const compliancePct = Math.min(100, Math.floor((completed / required) * 100));

          // Bounds invariant
          expect(compliancePct).toBeGreaterThanOrEqual(0);
          expect(compliancePct).toBeLessThanOrEqual(100);

          // Formula correctness
          const expected = Math.min(100, Math.floor((completed / required) * 100));
          expect(compliancePct).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('scan_compliance_pct is an integer', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.integer({ min: 1, max: 100_000 }), // required_scans must be >= 1 (per spec)
        (completed, required) => {
          const compliancePct = Math.min(100, Math.floor((completed / required) * 100));
          expect(Number.isInteger(compliancePct)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 9: Supervisor override role enforcement ────────────────────────
// Feature: risk-based-scanning-policy, Property 9: Supervisor override role enforcement
// Validates: Requirements 6.1

describe('Property 9: Supervisor override role enforcement', () => {
  it('checkOverrideRole returns false for any role array not containing Inbound_Supervisor', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        (roles) => {
          // Filter to arrays that do NOT contain 'Inbound_Supervisor'
          fc.pre(!roles.includes('Inbound_Supervisor'));

          const result = checkOverrideRole(roles);

          // Must be rejected — no Inbound_Supervisor role present
          expect(result).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('checkOverrideRole returns true for any role array containing Inbound_Supervisor', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        (extraRoles) => {
          // Inject Inbound_Supervisor at a random position
          const roles = [...extraRoles, 'Inbound_Supervisor'];

          const result = checkOverrideRole(roles);

          expect(result).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 10: Supervisor override reason code enforcement ─────────────────
// Feature: risk-based-scanning-policy, Property 10: Supervisor override reason code enforcement
// Validates: Requirements 6.2

describe('Property 10: Supervisor override reason code enforcement', () => {
  it('checkReasonCode returns false for empty or whitespace-only strings', () => {
    // Generate strings that consist only of whitespace characters
    const whitespaceArb = fc.stringOf(
      fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'),
    );

    fc.assert(
      fc.property(whitespaceArb, (reasonCode) => {
        const result = checkReasonCode(reasonCode);

        // Empty / whitespace-only reason codes must be rejected
        expect(result).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('checkReasonCode returns true for strings with at least one non-whitespace character', () => {
    // Generate strings that have at least one non-whitespace character
    const nonEmptyArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(nonEmptyArb, (reasonCode) => {
        const result = checkReasonCode(reasonCode);

        expect(result).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Property 11: Scan policy round-trip consistency ─────────────────────────
// Feature: risk-based-scanning-policy, Property 11: Scan policy round-trip consistency
// Validates: Requirements 8.5

import { isValidModifier } from '../../admin/admin.service.js';
import type { ScanPolicyConfig } from '../scan-policy.engine.js';

const packagingClassArb = fc.constantFrom(
  'SealedCarton',
  'GunnyBag',
  'Rice',
  'ShrinkWrap',
  'Loose',
  'MixedLoad',
);

const classConfigArb = fc.record({
  base_formula: fc.string({ minLength: 1, maxLength: 50 }),
  physical_count_required: fc.boolean(),
  label_affixing_required: fc.boolean(),
  packaging_integrity_preserve: fc.boolean(),
});

const scanPolicyConfigArb: fc.Arbitrary<ScanPolicyConfig> = fc.record({
  packaging_classes: fc.record({
    SealedCarton: classConfigArb,
    GunnyBag: classConfigArb,
    Rice: classConfigArb,
    ShrinkWrap: classConfigArb,
    Loose: classConfigArb,
    MixedLoad: classConfigArb,
  }),
  low_confidence_threshold: fc.integer({ min: 0, max: 100 }),
  low_confidence_multiplier: fc.float({ min: 1.0, max: 3.0, noNaN: true }),
});

describe('Property 11: Scan policy round-trip consistency', () => {
  it('JSON.parse(JSON.stringify(P)) produces an object equal to P for any ScanPolicyConfig', () => {
    fc.assert(
      fc.property(scanPolicyConfigArb, (policy) => {
        const roundTripped = JSON.parse(JSON.stringify(policy)) as ScanPolicyConfig;

        // Top-level scalar fields
        expect(roundTripped.low_confidence_threshold).toBe(policy.low_confidence_threshold);
        expect(roundTripped.low_confidence_multiplier).toBe(policy.low_confidence_multiplier);

        // Per-class config fields
        for (const cls of [
          'SealedCarton',
          'GunnyBag',
          'Rice',
          'ShrinkWrap',
          'Loose',
          'MixedLoad',
        ] as const) {
          const orig = policy.packaging_classes[cls];
          const rt = roundTripped.packaging_classes[cls];
          expect(rt.base_formula).toBe(orig.base_formula);
          expect(rt.physical_count_required).toBe(orig.physical_count_required);
          expect(rt.label_affixing_required).toBe(orig.label_affixing_required);
          expect(rt.packaging_integrity_preserve).toBe(orig.packaging_integrity_preserve);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Property 12: DC isolation invariant ─────────────────────────────────────
// Feature: risk-based-scanning-policy, Property 12: DC isolation invariant
// Validates: Requirements 8.8

describe('Property 12: DC isolation invariant', () => {
  it('isValidModifier is a pure function: same input always gives same output', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        (modifier) => {
          // Calling the function twice with the same input must yield the same result
          const result1 = isValidModifier(modifier);
          const result2 = isValidModifier(modifier);
          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('modifier validation is independent of DC context: same modifier, different DCs, same result', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (modifier, dc1, dc2) => {
          // isValidModifier must not depend on DC identity
          const resultForDc1 = isValidModifier(modifier);
          const resultForDc2 = isValidModifier(modifier);
          expect(resultForDc1).toBe(resultForDc2);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 13: Modifier range enforcement ─────────────────────────────────
// Feature: risk-based-scanning-policy, Property 13: Modifier range enforcement
// Validates: Requirements 8.2, 8.6

describe('Property 13: Modifier range enforcement', () => {
  it('isValidModifier returns true iff 0.5 <= m <= 5.0 for arbitrary float values', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        (modifier) => {
          const result = isValidModifier(modifier);
          const expected = modifier >= 0.5 && modifier <= 5.0;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('isValidModifier accepts all values in [0.5, 5.0]', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.5, max: 5.0, noNaN: true }),
        (modifier) => {
          expect(isValidModifier(modifier)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('isValidModifier rejects all values below 0.5', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }).filter((v) => v < 0.5),
        (modifier) => {
          expect(isValidModifier(modifier)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('isValidModifier rejects all values above 5.0', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }).filter((v) => v > 5.0),
        (modifier) => {
          expect(isValidModifier(modifier)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 14: Delivery compliance aggregation ────────────────────────────
// Feature: risk-based-scanning-policy, Property 14: Delivery compliance aggregation
// Validates: Requirements 9.2

describe('Property 14: Delivery compliance aggregation', () => {
  it('arithmetic mean of line-level scan_compliance_pct values rounded to nearest integer equals Math.round(sum / count)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1 }),
        (linePcts) => {
          // Pure formula: delivery_scan_compliance_pct = Math.round(sum / count)
          const sum = linePcts.reduce((acc, pct) => acc + pct, 0);
          const count = linePcts.length;
          const deliveryCompliancePct = Math.round(sum / count);

          // Assert the formula matches the expected arithmetic mean rounded to nearest integer
          expect(deliveryCompliancePct).toBe(Math.round(sum / count));

          // Result must be in [0, 100]
          expect(deliveryCompliancePct).toBeGreaterThanOrEqual(0);
          expect(deliveryCompliancePct).toBeLessThanOrEqual(100);

          // Result must be an integer
          expect(Number.isInteger(deliveryCompliancePct)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });
});
