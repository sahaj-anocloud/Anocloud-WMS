import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuarantineService } from './quarantine.service.js';
import type { Pool, PoolClient } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';

describe('QuarantineService', () => {
  let svc: QuarantineService;
  let mockDb: Pool;
  let mockSqs: SQSClient;
  let mockClient: PoolClient;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as any;

    mockDb = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
    } as any;

    mockSqs = {
      send: vi.fn().mockResolvedValue({}),
    } as any;

    svc = new QuarantineService(mockDb, mockSqs, 'http://test-queue');
  });

  describe('placeQuarantine', () => {
    it('should atomically move stock to Held and record audit event', async () => {
      const mockRecord = {
        quarantine_id: 'q-123',
        dc_id: 'DC01',
        sku_id: 'SKU-A',
        quantity: 10,
        reason_code: 'DAMAGED',
        financial_status: 'Held',
        hours_open: 0,
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // adjustLedger - insert
        .mockResolvedValueOnce({ rows: [{ quantity: '0' }] } as any) // adjustLedger - update (Available)
        .mockResolvedValueOnce({ rows: [] } as any) // adjustLedger - insert
        .mockResolvedValueOnce({ rows: [{ quantity: '10' }] } as any) // adjustLedger - update (Held)
        .mockResolvedValueOnce({ rows: [{ zone_id: 'AmbientZone1' }] } as any) // Get zone
        .mockResolvedValueOnce({ rows: [mockRecord] } as any) // insert quarantine_records
        .mockResolvedValueOnce({ rows: [] } as any) // insert audit_event
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await svc.placeQuarantine({
        dcId: 'DC01',
        skuId: 'SKU-A',
        quantity: 10,
        reasonCode: 'DAMAGED',
        userId: 'user-1',
        deviceId: 'dev-1',
      });

      expect(result).toEqual(mockRecord);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw and rollback if ledger update fails (insufficient stock)', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // adjustLedger - insert
        .mockResolvedValueOnce({ rows: [{ quantity: '-10' }] } as any); // adjustLedger - update (Available) -> Negative!

      await expect(svc.placeQuarantine({
        dcId: 'DC01',
        skuId: 'SKU-A',
        quantity: 10,
        reasonCode: 'DAMAGED',
        userId: 'user-1',
        deviceId: 'dev-1',
      })).rejects.toThrow('NEGATIVE_QUANTITY');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should assign ColdZone physical location for perishable items (BR-14)', async () => {
      const mockRecord = { quarantine_id: 'q-1', physical_location: 'ColdZone' };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // Available insert
        .mockResolvedValueOnce({ rows: [{ quantity: '0' }] } as any) // Available update
        .mockResolvedValueOnce({ rows: [] } as any) // Held insert
        .mockResolvedValueOnce({ rows: [{ quantity: '10' }] } as any) // Held update
        .mockResolvedValueOnce({ rows: [{ zone_id: 'ColdZone' }] } as any) // Get zone
        .mockResolvedValueOnce({ rows: [mockRecord] } as any); // insert record

      await svc.placeQuarantine({
        dcId: 'DC01',
        skuId: 'SKU-A',
        quantity: 10,
        reasonCode: 'DAMAGED',
        userId: 'user-1',
        deviceId: 'dev-1',
        isPerishable: true,
      });

      const insertCall = vi.mocked(mockClient.query).mock.calls.find(c => 
        typeof c[0] === 'string' && c[0].includes('INSERT INTO quarantine_records')
      );
      expect(insertCall?.[1]?.[5]).toBe('ColdZone');
    });
  });

  describe('resolveQuarantine', () => {
    it('should move stock back to Available when outcome is Accept', async () => {
      const mockRecord = { sku_id: 'SKU-A', quantity: 5, bin_confirmed_at: new Date().toISOString() };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRecord] } as any) // fetch record
        .mockResolvedValueOnce({ rows: [] } as any) // Held insert
        .mockResolvedValueOnce({ rows: [{ quantity: '0' }] } as any) // Held update
        .mockResolvedValueOnce({ rows: [] } as any) // Available insert
        .mockResolvedValueOnce({ rows: [{ quantity: '5' }] } as any) // Available update
        .mockResolvedValueOnce({ rows: [] } as any) // update quarantine_records
        .mockResolvedValueOnce({ rows: [] } as any) // insert audit
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await svc.resolveQuarantine({
        quarantineId: 'q-1',
        dcId: 'DC01',
        outcome: 'Accept',
        reasonCode: 'CLEARED',
        userId: 'user-1',
        deviceId: 'dev-1',
      });

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should move stock to Rejected when outcome is Reject', async () => {
      const mockRecord = { sku_id: 'SKU-A', quantity: 5 };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockRecord] } as any) // fetch
        .mockResolvedValueOnce({ rows: [] } as any) // Held decr insert
        .mockResolvedValueOnce({ rows: [{ quantity: '0' }] } as any) // Held decr update
        .mockResolvedValueOnce({ rows: [] } as any) // Rejected incr insert
        .mockResolvedValueOnce({ rows: [{ quantity: '5' }] } as any) // Rejected incr update
        .mockResolvedValueOnce({ rows: [] } as any) // update rec
        .mockResolvedValueOnce({ rows: [] } as any) // audit
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await svc.resolveQuarantine({
        quarantineId: 'q-1',
        dcId: 'DC01',
        outcome: 'Reject',
        reasonCode: 'BAD_QUALITY',
        userId: 'user-1',
        deviceId: 'dev-1',
      });

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('checkAndAlertOpenHolds', () => {
    it('should create alerts for holds open > 4 hours', async () => {
      const mockHolds = [
        { quarantine_id: 'q-1', dc_id: 'DC01', sku_id: 'SKU-1', placed_at: '2026-04-22T10:00:00Z' }
      ];

      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({ rows: mockHolds } as any) // fetch stale holds
        .mockResolvedValueOnce({ rows: [{ alert_id: 'alert-1' }] } as any); // insert alert

      await svc.checkAndAlertOpenHolds();

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockSqs.send).toHaveBeenCalled();
    });
  });
});
