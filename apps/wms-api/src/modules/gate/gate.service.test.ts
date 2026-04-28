import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GateService } from './gate.service.js';
import type { Pool, PoolClient } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';

describe('GateService', () => {
  let gateService: GateService;
  let mockDb: Pool;
  let mockSqsClient: SQSClient;
  let mockClient: PoolClient;

  beforeEach(() => {
    process.env['ALERT_EVENTS_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/123456789/alert-events';
    
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as any;

    mockDb = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
    } as any;

    mockSqsClient = {
      send: vi.fn().mockResolvedValue({}),
    } as any;

    gateService = new GateService(mockDb, mockSqsClient);
  });

  describe('registerGateEntry', () => {
    it('should register gate entry for active vendor with confirmed appointment', async () => {
      const mockVendor = { compliance_status: 'Active' };
      const mockAppointment = { status: 'Confirmed', slot_start: new Date() };
      const mockYardEntry = {
        entry_id: 'entry-123',
        dc_id: 'DC01',
        vehicle_reg: 'KA01AB1234',
        vendor_id: 'vendor-123',
        gate_in_at: new Date(),
        status: 'InYard',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockVendor] } as any) // vendor check
        .mockResolvedValueOnce({ rows: [mockAppointment] } as any) // appointment check
        .mockResolvedValueOnce({ rows: [mockYardEntry] } as any) // insert
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await gateService.registerGateEntry({
        dc_id: 'DC01',
        vehicle_reg: 'KA01AB1234',
        vendor_id: 'vendor-123',
        appointment_id: 'appt-123',
      });

      expect(result).toEqual(mockYardEntry);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should reject entry for non-active vendor', async () => {
      const mockVendor = { compliance_status: 'Suspended' };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockVendor] } as any); // vendor check

      await expect(
        gateService.registerGateEntry({
          dc_id: 'DC01',
          vehicle_reg: 'KA01AB1234',
          vendor_id: 'vendor-123',
        })
      ).rejects.toThrow('Vendor compliance status is Suspended');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject entry for vendor not found', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any); // vendor check - not found

      await expect(
        gateService.registerGateEntry({
          dc_id: 'DC01',
          vehicle_reg: 'KA01AB1234',
          vendor_id: 'vendor-123',
        })
      ).rejects.toThrow('Vendor not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject entry for non-confirmed appointment', async () => {
      const mockVendor = { compliance_status: 'Active' };
      const mockAppointment = { status: 'Requested', slot_start: new Date() };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockVendor] } as any) // vendor check
        .mockResolvedValueOnce({ rows: [mockAppointment] } as any); // appointment check

      await expect(
        gateService.registerGateEntry({
          dc_id: 'DC01',
          vehicle_reg: 'KA01AB1234',
          vendor_id: 'vendor-123',
          appointment_id: 'appt-123',
        })
      ).rejects.toThrow('Appointment status is Requested');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getYardQueue', () => {
    it('should return yard queue with dwell times', async () => {
      const mockQueue = [
        {
          entry_id: 'entry-1',
          vehicle_reg: 'KA01AB1234',
          vendor_id: 'vendor-1',
          vendor_name: 'Vendor A',
          gate_in_at: new Date(),
          dwell_seconds: 1800,
          status: 'InYard',
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: mockQueue } as any);

      const result = await gateService.getYardQueue('DC01');

      expect(result).toEqual(mockQueue);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['DC01']
      );
    });
  });

  describe('assignDock', () => {
    it('should assign dock and notify supervisor', async () => {
      const mockYardEntry = {
        entry_id: 'entry-123',
        vendor_id: 'vendor-123',
        vehicle_reg: 'KA01AB1234',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // cargoTempResult check (Ambient)
        .mockResolvedValueOnce({ rows: [{ temp_class: 'Ambient' }] } as any) // dockResult check
        .mockResolvedValueOnce({ rows: [mockYardEntry] } as any) // update
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await gateService.assignDock({
        entry_id: 'entry-123',
        dock_door: 'DOCK-A',
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if yard entry not found', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // cargoTempResult check
        .mockResolvedValueOnce({ rows: [{ temp_class: 'Ambient' }] } as any) // dockResult check
        .mockResolvedValueOnce({ rows: [] } as any); // update - not found

      await expect(
        gateService.assignDock({
          entry_id: 'entry-123',
          dock_door: 'DOCK-A',
        })
      ).rejects.toThrow('Yard entry not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getDwellTime', () => {
    it('should return dwell time in seconds', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{ dwell_seconds: 3600.5 }],
      } as any);

      const result = await gateService.getDwellTime('entry-123');

      expect(result).toBe(3600);
    });

    it('should throw error if entry not found', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [] } as any);

      await expect(gateService.getDwellTime('entry-123')).rejects.toThrow(
        'Yard entry not found'
      );
    });
  });
});
