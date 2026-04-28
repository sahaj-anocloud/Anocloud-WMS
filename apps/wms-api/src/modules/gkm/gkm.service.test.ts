import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GKMService } from './gkm.service';
import { Pool } from 'pg';

describe('GKMService', () => {
  let gkmService: GKMService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      connect: vi.fn(),
      query: vi.fn()
    };
    gkmService = new GKMService(mockDb as unknown as Pool);
  });

  describe('gkmVariancePct', () => {
    it('should calculate variance percentage correctly', () => {
      expect(gkmService.gkmVariancePct(100, 100)).toBe(0);
      expect(gkmService.gkmVariancePct(101, 100)).toBe(1);
      expect(gkmService.gkmVariancePct(99, 100)).toBe(1);
      expect(gkmService.gkmVariancePct(105, 100)).toBe(5);
      expect(gkmService.gkmVariancePct(95, 100)).toBe(5);
    });

    it('should handle decimal prices correctly', () => {
      expect(gkmService.gkmVariancePct(45.50, 45.00)).toBeCloseTo(1.111, 2);
      expect(gkmService.gkmVariancePct(45.83, 45.50)).toBeCloseTo(0.726, 2);
    });

    it('should throw error for zero PO price', () => {
      expect(() => gkmService.gkmVariancePct(100, 0)).toThrow('PO price cannot be zero');
    });
  });

  describe('gkmTier', () => {
    it('should return AutoAccept for variance <= 0.1%', () => {
      expect(gkmService.gkmTier(0)).toBe('AutoAccept');
      expect(gkmService.gkmTier(0.05)).toBe('AutoAccept');
      expect(gkmService.gkmTier(0.1)).toBe('AutoAccept');
    });

    it('should return SoftStop for variance > 0.1% and <= 0.5%', () => {
      expect(gkmService.gkmTier(0.1001)).toBe('SoftStop');
      expect(gkmService.gkmTier(0.3)).toBe('SoftStop');
      expect(gkmService.gkmTier(0.5)).toBe('SoftStop');
    });

    it('should return HardStop for variance > 0.5%', () => {
      expect(gkmService.gkmTier(0.5001)).toBe('HardStop');
      expect(gkmService.gkmTier(0.72)).toBe('HardStop');
      expect(gkmService.gkmTier(1.0)).toBe('HardStop');
      expect(gkmService.gkmTier(5.0)).toBe('HardStop');
    });

    it('should handle exact boundary values correctly', () => {
      // Test exact boundaries
      expect(gkmService.gkmTier(0.1)).toBe('AutoAccept');
      expect(gkmService.gkmTier(0.10001)).toBe('SoftStop');
      expect(gkmService.gkmTier(0.5)).toBe('SoftStop');
      expect(gkmService.gkmTier(0.50001)).toBe('HardStop');
    });
  });

  describe('runGKMCheck', () => {
    it('should create GKM check and update delivery line status for AutoAccept', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ po_unit_price: 100 }] }) // Get PO price
          .mockResolvedValueOnce({ // Insert gkm_checks
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              po_unit_price: 100,
              invoice_unit_price: 100.05,
              variance_pct: 0.05,
              tier: 'AutoAccept',
              checked_at: new Date()
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      const result = await gkmService.runGKMCheck({
        deliveryLineId: 'line-123',
        invoiceUnitPrice: 100.05,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(result.tier).toBe('AutoAccept');
      expect(result.variancePct).toBeCloseTo(0.05, 2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should create GKM check and trigger alert for HardStop', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ po_unit_price: 100 }] }) // Get PO price
          .mockResolvedValueOnce({ // Insert gkm_checks
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              po_unit_price: 100,
              invoice_unit_price: 106,
              variance_pct: 6.0,
              tier: 'HardStop',
              checked_at: new Date()
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }) // Insert alert
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      const result = await gkmService.runGKMCheck({
        deliveryLineId: 'line-123',
        invoiceUnitPrice: 106,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(result.tier).toBe('HardStop');
      expect(result.variancePct).toBe(6.0);
      
      // Verify alert was published
      const alertCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('INSERT INTO alerts')
      );
      expect(alertCall).toBeDefined();
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ po_unit_price: 100 }] })
          .mockRejectedValueOnce(new Error('Database error')),
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await expect(gkmService.runGKMCheck({
        deliveryLineId: 'line-123',
        invoiceUnitPrice: 100,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('approveGKMCheck', () => {
    it('should approve GKM check and update delivery line status', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get check details
            rows: [{
              check_id: 'check-123',
              tier: 'SoftStop',
              delivery_line_id: 'line-123',
              variance_pct: 0.3,
              delivery_id: 'delivery-123',
              dc_id: 'dc-001'
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update gkm_checks
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await gkmService.approveGKMCheck({
        checkId: 'check-123',
        approverId: 'supervisor-123',
        approverRole: 'Inbound_Supervisor',
        deviceId: 'device-123'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Verify delivery_lines was updated to Approved
      const updateCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('UPDATE delivery_lines') && call[0].includes('Approved')
      );
      expect(updateCall).toBeDefined();
    });

    it('should throw error if check not found', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // Get check details (empty)
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await expect(gkmService.approveGKMCheck({
        checkId: 'nonexistent',
        approverId: 'supervisor-123',
        approverRole: 'Inbound_Supervisor',
        deviceId: 'device-123'
      })).rejects.toThrow('GKM check not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
