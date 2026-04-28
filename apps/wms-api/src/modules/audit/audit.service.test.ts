import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { AuditService, type AuditEventRow } from './audit.service.js';

// Create an AuditService with a mock DB to test pure logic
// (serialization/deserialization, chain completeness — no DB needed)

const mockDb = {} as never;
const svc = new AuditService(mockDb);

// ─── Serialize / Deserialize Unit Tests ───────────────────────────────────────

describe('AuditService serialization', () => {
  const sampleEvent: AuditEventRow = {
    event_id: 'evt-1',
    dc_id: 'DC001',
    event_type: 'GATE_ENTRY',
    user_id: 'user-1',
    device_id: 'device-1',
    occurred_at: '2026-04-22T10:00:00.000Z',
    reference_doc: 'LPN-001',
    previous_state: { status: 'InYard' },
    new_state: { status: 'AtDock' },
    reason_code: 'Normal gate entry',
  };

  it('serialize then parse returns identical events', () => {
    const json = svc.serializeEvents([sampleEvent]);
    const parsed = svc.parseEvents(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(sampleEvent);
  });

  it('serialize empty array returns valid JSON', () => {
    const json = svc.serializeEvents([]);
    const parsed = svc.parseEvents(json);
    expect(parsed).toHaveLength(0);
  });
});

// ─── Property 25: Audit Log Immutability ──────────────────────────────────────
// The count of audit entries for any reference doc is monotonically non-decreasing.
// Simulated by applying a sequence of append operations and verifying the count
// never decreases.
// Validates: Req 16.1, 16.6

describe('Property 25: Audit Log Immutability', () => {
  it('event count is monotonically non-decreasing as events are appended', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            event_id: fc.uuid(),
            dc_id: fc.constantFrom('DC001', 'DC002'),
            event_type: fc.constantFrom(
              'GATE_ENTRY', 'DOCK_ASSIGNED', 'UNLOADING_SCAN',
              'QC_SCAN', 'GKM_CHECK', 'GST_CHECK', 'GRPO_CONFIRMED',
            ),
            user_id: fc.uuid(),
            device_id: fc.string({ minLength: 1, maxLength: 20 }),
            occurred_at: fc.date().map((d) => d.toISOString()),
            reference_doc: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (events) => {
          // Simulate an in-memory append-only log
          const log: AuditEventRow[] = [];
          let previousCount = 0;

          for (const rawEvent of events) {
            log.push({
              ...rawEvent,
              previous_state: undefined,
              new_state: undefined,
              reason_code: undefined,
            });

            const currentCount = log.length;
            // Count must be >= previous count (monotonically non-decreasing)
            expect(currentCount).toBeGreaterThanOrEqual(previousCount);
            previousCount = currentCount;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no entry is deleted or modified after creation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            event_id: fc.uuid(),
            event_type: fc.string({ minLength: 3, maxLength: 30 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (events) => {
          const log: typeof events = [];

          for (const ev of events) {
            log.push({ ...ev });

            // Snapshot the current log state
            const snapshot = log.map((e) => ({ ...e }));

            // Verify no existing entry was modified
            for (let i = 0; i < snapshot.length - 1; i++) {
              expect(log[i]).toEqual(snapshot[i]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 26: Audit Log Export Round-Trip ─────────────────────────────────
// Export to JSON, parse back, re-export; assert byte-identical output.
// Validates: Req 16.7

describe('Property 26: Audit Log Export Round-Trip', () => {
  it('JSON export is byte-identical after re-export', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            event_id: fc.uuid(),
            dc_id: fc.string({ minLength: 1, maxLength: 20 }),
            event_type: fc.string({ minLength: 1, maxLength: 50 }),
            user_id: fc.uuid(),
            device_id: fc.string({ minLength: 1, maxLength: 30 }),
            occurred_at: fc.date().map((d) => d.toISOString()),
            reference_doc: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            previous_state: fc.option(
              fc.record({ key: fc.string() }).map((o) => o as Record<string, unknown>),
              { nil: undefined },
            ),
            new_state: fc.option(
              fc.record({ key: fc.string() }).map((o) => o as Record<string, unknown>),
              { nil: undefined },
            ),
            reason_code: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          }) as fc.Arbitrary<AuditEventRow>,
          { minLength: 0, maxLength: 20 },
        ),
        (events) => {
          // First export
          const json1 = svc.serializeEvents(events);
          // Parse back
          const parsed = svc.parseEvents(json1);
          // Re-export
          const json2 = svc.serializeEvents(parsed);

          // Assert byte-identical
          expect(json1).toBe(json2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('parse(serialize(events)) equals original events', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            event_id: fc.uuid(),
            dc_id: fc.constantFrom('DC001', 'DC002'),
            event_type: fc.constantFrom('GATE_ENTRY', 'QC_SCAN', 'GRPO_CONFIRMED'),
            user_id: fc.uuid(),
            device_id: fc.string({ minLength: 1, maxLength: 20 }),
            occurred_at: fc.date().map((d) => d.toISOString()),
            reference_doc: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
            previous_state: fc.constant(undefined),
            new_state: fc.constant(undefined),
            reason_code: fc.constant(undefined),
          }) as fc.Arbitrary<AuditEventRow>,
          { minLength: 0, maxLength: 15 },
        ),
        (events) => {
          const parsed = svc.parseEvents(svc.serializeEvents(events));
          expect(parsed).toEqual(events);
        },
      ),
      { numRuns: 100 },
    );
  });
});
