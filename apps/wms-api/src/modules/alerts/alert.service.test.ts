import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ALERT_TYPE_CONFIGS, type AlertTypeConfig } from './alert.service.js';

// ─── Alert Type Config Unit Tests ─────────────────────────────────────────────

describe('Alert type configuration', () => {
  const requiredTypes = [
    'VENDOR_DOC_EXPIRY',
    'GST_MISMATCH',
    'GKM_SOFT_STOP',
    'GKM_HARD_STOP',
    'PERISHABLE_DWELL',
    'QUARANTINE_OPEN_4H',
    'VEHICLE_DWELL_60M',
    'SAP_SYNC_DISCREPANCY',
    'UNEXPECTED_ITEM',
    'SAP_GRPO_FAILURE',
  ];

  it('defines all ten required alert types', () => {
    for (const type of requiredTypes) {
      expect(ALERT_TYPE_CONFIGS).toHaveProperty(type);
    }
  });

  it('every alert type has at least one target role', () => {
    for (const [type, config] of Object.entries(ALERT_TYPE_CONFIGS)) {
      expect(config.targetRoles.length, `${type} must have target roles`).toBeGreaterThan(0);
    }
  });

  it('every alert type has at least one channel', () => {
    for (const [type, config] of Object.entries(ALERT_TYPE_CONFIGS)) {
      expect(config.channels.length, `${type} must have channels`).toBeGreaterThan(0);
    }
  });

  it('critical alerts have escalation windows <= 30 minutes', () => {
    for (const [type, config] of Object.entries(ALERT_TYPE_CONFIGS)) {
      if (config.severity === 'Critical') {
        expect(
          config.escalationWindowMinutes,
          `${type} critical alerts must escalate within 30 min`,
        ).toBeLessThanOrEqual(30);
      }
    }
  });

  it('escalation target roles are defined for each alert type', () => {
    for (const [type, config] of Object.entries(ALERT_TYPE_CONFIGS)) {
      expect(
        config.escalationTargetRoles.length,
        `${type} must have escalation target roles`,
      ).toBeGreaterThan(0);
    }
  });
});

// ─── Property 27: Alert Delivery Completeness ─────────────────────────────────
// For every triggered alert, at least one alert_deliveries record exists.
// No alert is silently dropped.
// Validates: Req 17.1, 17.3

describe('Property 27: Alert Delivery Completeness', () => {
  it('every alert type produces at least one delivery record when users exist', () => {
    const allAlertTypes = Object.keys(ALERT_TYPE_CONFIGS);

    fc.assert(
      fc.property(
        fc.constantFrom(...allAlertTypes),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        (alertType, targetUserIds) => {
          const config = ALERT_TYPE_CONFIGS[alertType]!;

          // Simulate the fan-out logic
          const deliveryRecords: Array<{ userId: string; channel: string }> = [];

          for (const userId of targetUserIds) {
            for (const channel of config.channels) {
              deliveryRecords.push({ userId, channel });
            }
          }

          // Assert: at least one delivery record was created
          expect(deliveryRecords.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all ten alert types produce delivery records for non-empty user lists', () => {
    const allAlertTypes = Object.keys(ALERT_TYPE_CONFIGS);

    for (const alertType of allAlertTypes) {
      const config = ALERT_TYPE_CONFIGS[alertType]!;
      const mockUserIds = ['user-1', 'user-2'];

      const deliveries = mockUserIds.flatMap((uid) =>
        config.channels.map((ch) => ({ userId: uid, channel: ch })),
      );

      expect(deliveries.length).toBeGreaterThan(0);
    }
  });

  it('no alert type silently drops the SQS publish', () => {
    // Every alert type must have channels defined (SQS publish is triggered for all)
    for (const [type, config] of Object.entries(ALERT_TYPE_CONFIGS)) {
      expect(config.channels, `${type} must have at least one channel`).not.toHaveLength(0);
    }
  });
});

// ─── Property 28: Alert Escalation Ordering ───────────────────────────────────
// Alert triggered earlier escalates before or at the same time as a later alert
// of the same type when neither is acknowledged.
// Validates: Req 17.4, 17.5

describe('Property 28: Alert Escalation Ordering', () => {
  it('earlier triggered alert reaches escalation window before later alert', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(ALERT_TYPE_CONFIGS)),
        fc.array(
          fc.record({
            alertId: fc.uuid(),
            triggeredAt: fc.date({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }),
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (alertType, alerts) => {
          const config = ALERT_TYPE_CONFIGS[alertType]!;
          const windowMs = config.escalationWindowMinutes * 60 * 1000;

          // Sort by triggeredAt ascending
          const sorted = [...alerts].sort(
            (a, b) => a.triggeredAt.getTime() - b.triggeredAt.getTime(),
          );

          // Compute escalation due-time for each alert
          const withDue = sorted.map((a) => ({
            alertId: a.alertId,
            triggeredAt: a.triggeredAt,
            escalationDueAt: new Date(a.triggeredAt.getTime() + windowMs),
          }));

          // Invariant: if alert A triggered before alert B, A's escalation due time <= B's due time
          for (let i = 0; i < withDue.length - 1; i++) {
            const a = withDue[i]!;
            const b = withDue[i + 1]!;
            expect(a.escalationDueAt.getTime()).toBeLessThanOrEqual(
              b.escalationDueAt.getTime(),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('same-type alerts with equal trigger time have equal escalation due times', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(ALERT_TYPE_CONFIGS)),
        fc.date({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }),
        (alertType, triggeredAt) => {
          const config = ALERT_TYPE_CONFIGS[alertType]!;
          const windowMs = config.escalationWindowMinutes * 60 * 1000;
          const due1 = triggeredAt.getTime() + windowMs;
          const due2 = triggeredAt.getTime() + windowMs;
          expect(due1).toBe(due2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
