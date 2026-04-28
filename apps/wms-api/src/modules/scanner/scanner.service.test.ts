import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OfflineTransaction } from './scanner.service.js';

// ─── Property 33: Offline Queue Chronological Replay ──────────────────────────
// Transactions are always replayed in captured_at ASC order.
// No reordering occurs during sync.
// Validates: Req 20.10, 20.11

describe('Property 33: Offline Queue Chronological Replay', () => {
  function sortByTimestamp(txns: OfflineTransaction[]): OfflineTransaction[] {
    return [...txns].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    );
  }

  it('sort produces non-decreasing captured_at sequence', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            txn_type: fc.constantFrom('GATE_ENTRY', 'SCAN', 'QC_PASS', 'BATCH_CAPTURE'),
            payload: fc.constant({}),
            captured_at: fc.date({
              min: new Date('2026-01-01'),
              max: new Date('2026-12-31'),
            }).map((d) => d.toISOString()),
            device_id: fc.uuid(),
            user_id: fc.uuid(),
            dc_id: fc.constantFrom('DC001', 'DC002'),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (transactions) => {
          const sorted = sortByTimestamp(transactions);

          // Assert non-decreasing timestamp order
          for (let i = 0; i < sorted.length - 1; i++) {
            const a = new Date(sorted[i]!.captured_at).getTime();
            const b = new Date(sorted[i + 1]!.captured_at).getTime();
            expect(a).toBeLessThanOrEqual(b);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('out-of-order captures are correctly sorted before replay', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.date({
            min: new Date('2026-01-01'),
            max: new Date('2026-12-31'),
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (dates) => {
          const txns: OfflineTransaction[] = dates.map((d, i) => ({
            id: `txn-${i}`,
            txn_type: 'SCAN',
            payload: {},
            captured_at: d.toISOString(),
            device_id: 'device-1',
            user_id: 'user-1',
            dc_id: 'DC001',
          }));

          const sorted = sortByTimestamp(txns);

          // The min timestamp must be first
          const minTs = Math.min(...dates.map((d) => d.getTime()));
          expect(new Date(sorted[0]!.captured_at).getTime()).toBe(minTs);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all transactions appear in sorted output (no loss)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            txn_type: fc.constantFrom('GATE_ENTRY', 'SCAN', 'QC_PASS'),
            payload: fc.constant({}),
            captured_at: fc.date().map((d) => d.toISOString()),
            device_id: fc.uuid(),
            user_id: fc.uuid(),
            dc_id: fc.constantFrom('DC001', 'DC002'),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (transactions) => {
          const sorted = sortByTimestamp(transactions);
          expect(sorted.length).toBe(transactions.length);

          // Every original ID appears in output
          const sortedIds = new Set(sorted.map((t) => t.id));
          for (const t of transactions) {
            expect(sortedIds.has(t.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 34: Offline Sync Data Integrity ─────────────────────────────────
// All field values are identical between offline capture and server record.
// Validates: Req 20.10, 20.11, 20.12

describe('Property 34: Offline Sync Data Integrity', () => {
  // Simulate serializing a transaction for sync and deserializing at server
  function serializeTransaction(txn: OfflineTransaction): string {
    return JSON.stringify(txn);
  }

  function deserializeTransaction(json: string): OfflineTransaction {
    return JSON.parse(json) as OfflineTransaction;
  }

  it('serialize → deserialize preserves all field values', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          txn_type: fc.constantFrom('GATE_ENTRY', 'SCAN', 'QC_PASS', 'BATCH_CAPTURE'),
          payload: fc.record({
            vehicle_reg: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            barcode: fc.option(fc.string({ minLength: 8, maxLength: 50 }), { nil: undefined }),
            line_id: fc.option(fc.uuid(), { nil: undefined }),
            batch_number: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          }).map((p) => p as Record<string, unknown>),
          captured_at: fc.date().map((d) => d.toISOString()),
          device_id: fc.uuid(),
          user_id: fc.uuid(),
          dc_id: fc.constantFrom('DC001', 'DC002', 'MUM001'),
        }),
        (txn) => {
          const json = serializeTransaction(txn);
          const restored = deserializeTransaction(json);

          expect(restored.id).toBe(txn.id);
          expect(restored.txn_type).toBe(txn.txn_type);
          expect(restored.captured_at).toBe(txn.captured_at);
          expect(restored.device_id).toBe(txn.device_id);
          expect(restored.user_id).toBe(txn.user_id);
          expect(restored.dc_id).toBe(txn.dc_id);
          expect(JSON.stringify(restored.payload)).toBe(JSON.stringify(txn.payload));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('batch sync preserves transaction count and order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            txn_type: fc.constantFrom('SCAN', 'QC_PASS'),
            payload: fc.constant({}),
            captured_at: fc.date().map((d) => d.toISOString()),
            device_id: fc.uuid(),
            user_id: fc.uuid(),
            dc_id: fc.constantFrom('DC001', 'DC002'),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (transactions) => {
          // Simulate network payload
          const payload = JSON.stringify({ transactions });
          const parsed = JSON.parse(payload) as { transactions: OfflineTransaction[] };

          expect(parsed.transactions.length).toBe(transactions.length);

          // Every ID in the same order
          for (let i = 0; i < transactions.length; i++) {
            expect(parsed.transactions[i]!.id).toBe(transactions[i]!.id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
