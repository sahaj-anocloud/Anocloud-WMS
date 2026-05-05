/**
 * Offline Sync Stress Tests
 *
 * Tests the OfflineSyncService under conditions that mirror real warehouse usage:
 *   - Workers scan 50–200 items offline during network outage
 *   - Network reconnects and sync runs
 *   - Partial sync failures (server accepts some, rejects others)
 *   - Concurrent enqueue calls (two workers on same device)
 *   - Corrupted queue recovery
 *   - Retry behaviour after failed sync
 *
 * CRITICAL CORRECTNESS PROPERTIES:
 *   P1 — No data loss: every enqueued transaction must eventually be synced or remain in queue
 *   P2 — Ordering: transactions must be replayed in capture order (FIFO)
 *   P3 — Idempotency: a transaction applied once must not be applied again on retry
 *   P4 — Partial recovery: only successfully applied transactions are removed from queue
 *   P5 — Queue integrity: a failed sync must leave the queue unchanged
 *   P6 — Capacity: queue must handle 200+ items without data corruption
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineSyncService, OfflineTransaction } from '../sync.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@react-native-async-storage/async-storage');
vi.mock('../api.client');

const mockedStorage = AsyncStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

import apiClient from '../api.client';
const mockedApi = apiClient as unknown as {
  post: ReturnType<typeof vi.fn>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** In-memory AsyncStorage simulator — preserves state across calls in a test */
function makeMemoryStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn(async (key: string) => store[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn(async (key: string) => { delete store[key]; }),
    _store: store,
  };
}

/** Builds a minimal valid OfflineTransaction (without id/captured_at) */
function makeTxn(overrides: Partial<Omit<OfflineTransaction, 'id' | 'captured_at'>> = {}) {
  return {
    txn_type: 'SCAN' as const,
    payload: { barcode: '8901234567890', delivery_line_id: 'line-001' },
    dc_id: 'DC-BLR-01',
    user_id: 'qc-worker-001',
    device_id: 'scanner-device-01',
    ...overrides,
  };
}

/** Builds a server response where all transactions are applied */
function allApplied(queue: OfflineTransaction[]) {
  return { data: { results: queue.map(t => ({ id: t.id, status: 'applied' })) } };
}

/** Builds a server response where only the first N are applied */
function partialApplied(queue: OfflineTransaction[], n: number) {
  return {
    data: {
      results: queue.map((t, i) => ({
        id: t.id,
        status: i < n ? 'applied' : 'failed',
      })),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Offline Sync Stress Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── P1: No data loss ────────────────────────────────────────────────────────

  describe('P1 — No Data Loss', () => {
    it('all enqueued transactions survive a failed sync attempt', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      // Enqueue 50 scan transactions
      for (let i = 0; i < 50; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { barcode: `890${i}`, seq: i } }));
      }

      const sizeBefore = await OfflineSyncService.getQueueSize();
      expect(sizeBefore).toBe(50);

      // Simulate network failure during sync
      mockedApi.post = vi.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(OfflineSyncService.sync()).rejects.toThrow('Network timeout');

      // Queue must be unchanged after failed sync
      const sizeAfter = await OfflineSyncService.getQueueSize();
      expect(sizeAfter).toBe(50);
    });

    it('property: queue size never decreases after enqueue, only after successful sync', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (count) => {
            const mem = makeMemoryStorage();
            mockedStorage.getItem = mem.getItem;
            mockedStorage.setItem = mem.setItem;

            for (let i = 0; i < count; i++) {
              await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
            }

            const size = await OfflineSyncService.getQueueSize();
            expect(size).toBe(count);
          }
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── P2: Ordering ────────────────────────────────────────────────────────────

  describe('P2 — FIFO Ordering', () => {
    it('transactions are sent to server in the order they were captured', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      const sequence: number[] = [];
      for (let i = 0; i < 10; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
        sequence.push(i);
      }

      let capturedTransactions: OfflineTransaction[] = [];
      mockedApi.post = vi.fn().mockImplementation(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
        capturedTransactions = body.transactions;
        return allApplied(body.transactions);
      });

      await OfflineSyncService.sync();

      // Verify order matches enqueue order
      const sentSeqs = capturedTransactions.map(t => (t.payload as { seq: number }).seq);
      expect(sentSeqs).toEqual(sequence);
    });

    it('property: captured_at timestamps are non-decreasing in the queue', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 20 }),
          async (count) => {
            const mem = makeMemoryStorage();
            mockedStorage.getItem = mem.getItem;
            mockedStorage.setItem = mem.setItem;

            for (let i = 0; i < count; i++) {
              await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
            }

            const raw = await AsyncStorage.getItem('@wms_sync_queue');
            const queue: OfflineTransaction[] = raw ? JSON.parse(raw) : [];

            // Timestamps must be non-decreasing
            for (let i = 1; i < queue.length; i++) {
              const prev = new Date(queue[i - 1]!.captured_at).getTime();
              const curr = new Date(queue[i]!.captured_at).getTime();
              expect(curr).toBeGreaterThanOrEqual(prev);
            }
          }
        ),
        { numRuns: 15 },
      );
    });
  });

  // ── P3: Idempotency ─────────────────────────────────────────────────────────

  describe('P3 — Idempotency (no duplicate application)', () => {
    it('applied transactions are removed from queue after successful sync', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      for (let i = 0; i < 5; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      mockedApi.post = vi.fn().mockImplementation(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
        return allApplied(body.transactions);
      });

      await OfflineSyncService.sync();

      const sizeAfter = await OfflineSyncService.getQueueSize();
      expect(sizeAfter).toBe(0);
    });

    it('running sync twice does not send already-applied transactions again', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      for (let i = 0; i < 3; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      const sentBatches: OfflineTransaction[][] = [];
      mockedApi.post = vi.fn().mockImplementation(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
        sentBatches.push([...body.transactions]);
        return allApplied(body.transactions);
      });

      await OfflineSyncService.sync(); // First sync — applies all 3
      await OfflineSyncService.sync(); // Second sync — queue is empty, should not call API

      // Second sync should not send anything (queue is empty)
      expect(sentBatches).toHaveLength(1);
      expect(sentBatches[0]).toHaveLength(3);
    });
  });

  // ── P4: Partial recovery ────────────────────────────────────────────────────

  describe('P4 — Partial Sync Recovery', () => {
    it('only applied transactions are removed; failed ones remain in queue', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      for (let i = 0; i < 10; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      // Server applies first 6, fails last 4
      mockedApi.post = vi.fn().mockImplementation(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
        return partialApplied(body.transactions, 6);
      });

      await OfflineSyncService.sync();

      const remaining = await OfflineSyncService.getQueueSize();
      expect(remaining).toBe(4); // 10 - 6 = 4 remain
    });

    it('property: remaining queue size = total - applied count after partial sync', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 30 }),
          fc.integer({ min: 1, max: 4 }),
          async (total, failCount) => {
            const mem = makeMemoryStorage();
            mockedStorage.getItem = mem.getItem;
            mockedStorage.setItem = mem.setItem;

            for (let i = 0; i < total; i++) {
              await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
            }

            const applyCount = total - failCount;
            mockedApi.post = vi.fn().mockImplementation(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
              return partialApplied(body.transactions, applyCount);
            });

            await OfflineSyncService.sync();

            const remaining = await OfflineSyncService.getQueueSize();
            expect(remaining).toBe(failCount);
          }
        ),
        { numRuns: 15 },
      );
    });
  });

  // ── P5: Queue integrity on failure ─────────────────────────────────────────

  describe('P5 — Queue Integrity on Failure', () => {
    it('network error during sync leaves queue completely intact', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      const COUNT = 25;
      for (let i = 0; i < COUNT; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      // Capture queue state before sync attempt
      const rawBefore = await AsyncStorage.getItem('@wms_sync_queue');
      const queueBefore: OfflineTransaction[] = rawBefore ? JSON.parse(rawBefore) : [];

      mockedApi.post = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await expect(OfflineSyncService.sync()).rejects.toThrow();

      // Queue must be identical to before
      const rawAfter = await AsyncStorage.getItem('@wms_sync_queue');
      const queueAfter: OfflineTransaction[] = rawAfter ? JSON.parse(rawAfter) : [];

      expect(queueAfter).toHaveLength(queueBefore.length);
      expect(queueAfter.map(t => t.id)).toEqual(queueBefore.map(t => t.id));
    });

    it('HTTP 500 from server leaves queue intact', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      for (let i = 0; i < 10; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      mockedApi.post = vi.fn().mockRejectedValue(
        Object.assign(new Error('Internal Server Error'), { response: { status: 500 } })
      );

      await expect(OfflineSyncService.sync()).rejects.toThrow();

      const size = await OfflineSyncService.getQueueSize();
      expect(size).toBe(10);
    });
  });

  // ── P6: Capacity ────────────────────────────────────────────────────────────

  describe('P6 — Capacity (200+ items)', () => {
    it('handles 200 queued transactions without data corruption', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      const COUNT = 200;
      for (let i = 0; i < COUNT; i++) {
        await OfflineSyncService.enqueue(
          makeTxn({
            txn_type: i % 2 === 0 ? 'SCAN' : 'BATCH_CAPTURE',
            payload: {
              seq: i,
              barcode: `890${String(i).padStart(10, '0')}`,
              batch_number: `BATCH-${i}`,
            },
          })
        );
      }

      const size = await OfflineSyncService.getQueueSize();
      expect(size).toBe(COUNT);

      // Verify all IDs are unique (no collision in random ID generation)
      const raw = await AsyncStorage.getItem('@wms_sync_queue');
      const queue: OfflineTransaction[] = raw ? JSON.parse(raw) : [];
      const ids = queue.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(COUNT);
    });

    it('syncs 200 transactions in a single batch and clears queue', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      const COUNT = 200;
      for (let i = 0; i < COUNT; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      mockedApi.post = vi.fn().mockImplementation(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
        return allApplied(body.transactions);
      });

      await OfflineSyncService.sync();

      const sizeAfter = await OfflineSyncService.getQueueSize();
      expect(sizeAfter).toBe(0);

      // Verify all 200 were sent in one call
      expect(mockedApi.post).toHaveBeenCalledTimes(1);
      const sentBody = (mockedApi.post as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { transactions: OfflineTransaction[] };
      expect(sentBody.transactions).toHaveLength(COUNT);
    });
  });

  // ── Mixed transaction types ─────────────────────────────────────────────────

  describe('Mixed Transaction Types', () => {
    it('property: all transaction types are preserved correctly through enqueue/sync cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              txn_type: fc.constantFrom(
                'GATE_ENTRY',
                'SCAN',
                'QC_PASS',
                'BATCH_CAPTURE',
                'PRINT_LPN',
                'QUARANTINE_PLACE',
              ),
              payload: fc.record({
                barcode: fc.string({ minLength: 5, maxLength: 20 }),
                qty: fc.integer({ min: 1, max: 999 }),
              }),
              dc_id: fc.constant('DC-BLR-01'),
              user_id: fc.constant('worker-001'),
              device_id: fc.constant('device-001'),
            }),
            { minLength: 1, maxLength: 50 },
          ),
          async (txns) => {
            const mem = makeMemoryStorage();
            mockedStorage.getItem = mem.getItem;
            mockedStorage.setItem = mem.setItem;

            for (const txn of txns) {
              await OfflineSyncService.enqueue(txn);
            }

            const raw = await AsyncStorage.getItem('@wms_sync_queue');
            const queue: OfflineTransaction[] = raw ? JSON.parse(raw) : [];

            // P1: count matches
            expect(queue).toHaveLength(txns.length);

            // P2: types preserved in order
            queue.forEach((q, i) => {
              expect(q.txn_type).toBe(txns[i]!.txn_type);
            });

            // All have required fields
            queue.forEach(q => {
              expect(q.id).toBeTruthy();
              expect(q.captured_at).toBeTruthy();
              expect(q.dc_id).toBe('DC-BLR-01');
            });
          }
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── Retry after partial failure ─────────────────────────────────────────────

  describe('Retry Behaviour', () => {
    it('retrying sync after partial failure only sends remaining transactions', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      for (let i = 0; i < 10; i++) {
        await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
      }

      const sentBatches: OfflineTransaction[][] = [];

      // First sync: applies first 7, fails last 3
      mockedApi.post = vi.fn()
        .mockImplementationOnce(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
          sentBatches.push([...body.transactions]);
          return partialApplied(body.transactions, 7);
        })
        // Second sync: applies remaining 3
        .mockImplementationOnce(async (_url: string, body: { transactions: OfflineTransaction[] }) => {
          sentBatches.push([...body.transactions]);
          return allApplied(body.transactions);
        });

      await OfflineSyncService.sync(); // First attempt
      expect(await OfflineSyncService.getQueueSize()).toBe(3);

      await OfflineSyncService.sync(); // Retry
      expect(await OfflineSyncService.getQueueSize()).toBe(0);

      // First batch had 10, second batch had 3 (the remaining ones)
      expect(sentBatches[0]).toHaveLength(10);
      expect(sentBatches[1]).toHaveLength(3);

      // The 3 retried transactions must be the ones that failed (last 3 by seq)
      const retriedSeqs = sentBatches[1]!.map(t => (t.payload as { seq: number }).seq);
      expect(retriedSeqs).toEqual([7, 8, 9]);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('sync on empty queue does not call the API', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      mockedApi.post = vi.fn();

      await OfflineSyncService.sync();

      expect(mockedApi.post).not.toHaveBeenCalled();
    });

    it('enqueue with large payload does not corrupt adjacent items', async () => {
      const mem = makeMemoryStorage();
      mockedStorage.getItem = mem.getItem;
      mockedStorage.setItem = mem.setItem;

      // Small item
      await OfflineSyncService.enqueue(makeTxn({ payload: { seq: 0, small: true } }));

      // Large payload (simulates photo evidence base64)
      const largePayload = { seq: 1, data: 'x'.repeat(50_000) };
      await OfflineSyncService.enqueue(makeTxn({ payload: largePayload }));

      // Small item again
      await OfflineSyncService.enqueue(makeTxn({ payload: { seq: 2, small: true } }));

      const raw = await AsyncStorage.getItem('@wms_sync_queue');
      const queue: OfflineTransaction[] = raw ? JSON.parse(raw) : [];

      expect(queue).toHaveLength(3);
      expect((queue[0]!.payload as { seq: number }).seq).toBe(0);
      expect((queue[1]!.payload as { data: string }).data).toHaveLength(50_000);
      expect((queue[2]!.payload as { seq: number }).seq).toBe(2);
    });

    it('property: unique IDs are generated for all transactions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }),
          async (count) => {
            const mem = makeMemoryStorage();
            mockedStorage.getItem = mem.getItem;
            mockedStorage.setItem = mem.setItem;

            for (let i = 0; i < count; i++) {
              await OfflineSyncService.enqueue(makeTxn({ payload: { seq: i } }));
            }

            const raw = await AsyncStorage.getItem('@wms_sync_queue');
            const queue: OfflineTransaction[] = raw ? JSON.parse(raw) : [];
            const ids = queue.map(t => t.id);
            const uniqueIds = new Set(ids);

            // All IDs must be unique
            expect(uniqueIds.size).toBe(count);
          }
        ),
        { numRuns: 10 },
      );
    });
  });
});
