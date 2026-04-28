import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DwellTimerWorker } from './dwell-timer.js';
import type { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';

describe('DwellTimerWorker', () => {
  let worker: DwellTimerWorker;
  let mockDb: Pool;
  let mockSqsClient: SQSClient;

  beforeEach(() => {
    process.env['ALERT_EVENTS_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/123456789/alert-events';
    
    mockDb = {
      query: vi.fn(),
    } as any;

    mockSqsClient = {
      send: vi.fn().mockResolvedValue({}),
    } as any;

    worker = new DwellTimerWorker(mockDb, mockSqsClient);
  });

  describe('checkVehicleDwell', () => {
    it('should publish alerts for vehicles with dwell > 60 minutes', async () => {
      const mockEntries = [
        {
          entry_id: 'entry-1',
          vehicle_reg: 'KA01AB1234',
          vendor_id: 'vendor-1',
          dc_id: 'DC01',
          gate_in_at: new Date(Date.now() - 3700000), // 61+ minutes ago
          dwell_seconds: 3700,
        },
        {
          entry_id: 'entry-2',
          vehicle_reg: 'KA02CD5678',
          vendor_id: 'vendor-2',
          dc_id: 'DC01',
          gate_in_at: new Date(Date.now() - 7200000), // 120 minutes ago
          dwell_seconds: 7200,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: mockEntries } as any);

      await worker.checkVehicleDwell();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('EXTRACT(EPOCH FROM (now() - gate_in_at)) > 3600')
      );
      expect(mockSqsClient.send).toHaveBeenCalledTimes(2);
    });

    it('should not publish alerts if no vehicles exceed dwell threshold', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as any);

      await worker.checkVehicleDwell();

      expect(mockSqsClient.send).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(mockDb.query).mockRejectedValueOnce(new Error('DB error'));

      await expect(worker.checkVehicleDwell()).rejects.toThrow('DB error');
    });
  });

  describe('checkPerishableDwell', () => {
    it('should publish alerts for perishables with unloading > 25 minutes', async () => {
      const mockDeliveries = [
        {
          delivery_id: 'delivery-1',
          entry_id: 'entry-1',
          vehicle_reg: 'KA01AB1234',
          vendor_id: 'vendor-1',
          dc_id: 'DC01',
          unloading_start: new Date(Date.now() - 1600000), // 26+ minutes ago
          unloading_seconds: 1600,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: mockDeliveries } as any);

      await worker.checkPerishableDwell();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('s.is_perishable = true')
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('EXTRACT(EPOCH FROM (now() - ye.unloading_start)) > 1500')
      );
      expect(mockSqsClient.send).toHaveBeenCalledTimes(1);
    });

    it('should not publish alerts if no perishables exceed threshold', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as any);

      await worker.checkPerishableDwell();

      expect(mockSqsClient.send).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(mockDb.query).mockRejectedValueOnce(new Error('DB error'));

      await expect(worker.checkPerishableDwell()).rejects.toThrow('DB error');
    });
  });
});
