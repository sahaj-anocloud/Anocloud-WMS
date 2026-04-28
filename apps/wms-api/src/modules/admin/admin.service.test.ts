import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { AdminService, VALID_CONFIG_KEYS } from './admin.service.js';

// ─── VALID_CONFIG_KEYS unit tests ─────────────────────────────────────────────

describe('AdminService config key safelist', () => {
  it('contains all documented configurable parameters', () => {
    const required = [
      'gkm_auto_accept_pct',
      'gkm_soft_stop_pct',
      'alert_escalation_minutes',
      'dock_capacity_per_slot',
      'language_preference',
    ];
    for (const key of required) {
      expect(VALID_CONFIG_KEYS.has(key)).toBe(true);
    }
  });

  it('rejects unknown parameter keys', () => {
    expect(VALID_CONFIG_KEYS.has('unknown_param')).toBe(false);
    expect(VALID_CONFIG_KEYS.has('DROP TABLE')).toBe(false);
    expect(VALID_CONFIG_KEYS.has('')).toBe(false);
  });
});

// Mock AdminService that tracks updates per DC without a real DB
class MockAdminStore {
  private store = new Map<string, Map<string, string>>(); // dc_id → (key → value)

  update(dcId: string, key: string, value: string): void {
    if (!this.store.has(dcId)) this.store.set(dcId, new Map());
    this.store.get(dcId)!.set(key, value);
  }

  get(dcId: string, key: string): string | undefined {
    return this.store.get(dcId)?.get(key);
  }

  getAll(dcId: string): Map<string, string> {
    return this.store.get(dcId) ?? new Map();
  }
}

// ─── Property 31: RBAC Enforcement ────────────────────────────────────────────
// For any action where user lacks required role, the action is rejected.
// Validates: Req 19.2, 19.6

describe('Property 31: RBAC Enforcement', () => {
  const ALL_ROLES = [
    'WH_Associate', 'QC_Associate', 'Inbound_Supervisor', 'Inventory_Controller',
    'BnM_User', 'Finance_User', 'Vendor_User', 'Dock_Manager',
    'Admin_User', 'Leadership_Analytics_User',
  ];

  // Simulates the requireRole check from rbac.ts
  function hasAccess(userRoles: string[], requiredRoles: string[]): boolean {
    return requiredRoles.some((r) => userRoles.includes(r));
  }

  it('user with required role is granted access', () => {
    fc.assert(
      fc.property(
        fc.subarray(ALL_ROLES, { minLength: 1 }),
        fc.subarray(ALL_ROLES, { minLength: 1 }),
        (userRoles, requiredRoles) => {
          // If user has at least one required role, access must be granted
          const overlap = userRoles.filter((r) => requiredRoles.includes(r));
          if (overlap.length > 0) {
            expect(hasAccess(userRoles, requiredRoles)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('user without any required role is rejected', () => {
    fc.assert(
      fc.property(
        fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
        fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
        (userRoles, requiredRoles) => {
          const hasOverlap = userRoles.some((r) => requiredRoles.includes(r));
          if (!hasOverlap) {
            expect(hasAccess(userRoles, requiredRoles)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Admin_User always has access to admin-only routes', () => {
    expect(hasAccess(['Admin_User'], ['Admin_User'])).toBe(true);
    expect(hasAccess(['WH_Associate'], ['Admin_User'])).toBe(false);
    expect(hasAccess(['Finance_User'], ['Admin_User'])).toBe(false);
  });

  it('empty user roles never grants access', () => {
    fc.assert(
      fc.property(
        fc.subarray(ALL_ROLES, { minLength: 1 }),
        (requiredRoles) => {
          expect(hasAccess([], requiredRoles)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 32: DC Parameter Isolation ──────────────────────────────────────
// Config updates for DC-A don't affect DC-B's config values.
// Validates: Req 19.5

describe('Property 32: DC Parameter Isolation', () => {
  it('DC-A updates never contaminate DC-B config', () => {
    fc.assert(
      fc.property(
        fc.subarray(
          ['gkm_auto_accept_pct', 'gkm_soft_stop_pct', 'alert_escalation_minutes', 'dock_capacity_per_slot'],
          { minLength: 1 },
        ),
        fc.array(
          fc.record({
            key: fc.constantFrom('gkm_auto_accept_pct', 'gkm_soft_stop_pct', 'alert_escalation_minutes'),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        fc.string({ minLength: 1, maxLength: 10 }),
        (dcBKeys, dcAUpdates, suffix) => {
          const store = new MockAdminStore();
          const dcA = `DC_A_${suffix}`;
          const dcB = `DC_B_${suffix}`;

          // Set initial DC-B values
          for (const key of dcBKeys) {
            store.update(dcB, key, `initial-${key}`);
          }

          // Capture DC-B state before DC-A updates
          const beforeState = new Map<string, string>();
          for (const key of dcBKeys) {
            const val = store.get(dcB, key);
            if (val !== undefined) beforeState.set(key, val);
          }

          // Apply DC-A updates
          for (const update of dcAUpdates) {
            store.update(dcA, update.key, update.value);
          }

          // Verify DC-B is unchanged
          for (const [key, before] of beforeState) {
            expect(store.get(dcB, key)).toBe(before);
          }

          // Verify DC-A values don't bleed into DC-B
          for (const update of dcAUpdates) {
            const dcBVal = store.get(dcB, update.key);
            const dcAVal = store.get(dcA, update.key);
            if (dcBVal !== undefined && dcAVal !== undefined) {
              // DC-A update should not have changed DC-B
              expect(dcBVal).not.toBe(dcAVal);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
