import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GSTService } from './gst.service';
import { Pool } from 'pg';

describe('GSTService', () => {
  let gstService: GSTService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      connect: vi.fn(),
      query: vi.fn()
    };
    const mockSqs = { send: vi.fn() };
    gstService = new GSTService(mockDb as unknown as Pool, mockSqs as any, 'http://test-queue');
  });

  describe('runGSTCheck', () => {
    it('should create GST check with Matched status when rates match', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ sap_gst_rate: 18.0 }] }) // Get SAP GST rate
          .mockResolvedValueOnce({ // Insert gst_checks
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              sap_gst_rate: 18.0,
              invoice_gst_rate: 18.0,
              is_mismatch: false,
              checked_at: new Date()
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      const result = await gstService.runGSTCheck({
        deliveryLineId: 'line-123',
        invoiceGstRate: 18.0,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(result.isMismatch).toBe(false);
      expect(result.sapGstRate).toBe(18.0);
      expect(result.invoiceGstRate).toBe(18.0);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should create GST check with Mismatch status and trigger alert when rates differ', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ sap_gst_rate: 18.0 }] }) // Get SAP GST rate
          .mockResolvedValueOnce({ // Insert gst_checks
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              sap_gst_rate: 18.0,
              invoice_gst_rate: 12.0,
              is_mismatch: true,
              checked_at: new Date()
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }) // Insert alert
          .mockResolvedValueOnce({ rows: [{ is_perishable: false, requires_cold: false }] }) // Check perishable
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      const result = await gstService.runGSTCheck({
        deliveryLineId: 'line-123',
        invoiceGstRate: 12.0,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(result.isMismatch).toBe(true);
      expect(result.sapGstRate).toBe(18.0);
      expect(result.invoiceGstRate).toBe(12.0);
      
      // Verify alert was published
      const alertCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('INSERT INTO alerts')
      );
      expect(alertCall).toBeDefined();
    });

    it('should allow physical movement to Cold_Zone for perishable items with GST mismatch', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ sap_gst_rate: 18.0 }] }) // Get SAP GST rate
          .mockResolvedValueOnce({ // Insert gst_checks
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              sap_gst_rate: 18.0,
              invoice_gst_rate: 12.0,
              is_mismatch: true,
              checked_at: new Date()
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }) // Insert alert
          .mockResolvedValueOnce({ rows: [{ is_perishable: true, requires_cold: true }] }) // Check perishable
          .mockResolvedValueOnce({ rows: [] }) // Insert perishable audit event
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      const result = await gstService.runGSTCheck({
        deliveryLineId: 'line-123',
        invoiceGstRate: 12.0,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(result.isMismatch).toBe(true);
      
      // Verify perishable audit event was created
      const perishableAuditCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('INSERT INTO audit_events') && call[1] && call[1][1] === 'GST_CHECK'
      );
      expect(perishableAuditCall).toBeDefined();
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ sap_gst_rate: 18.0 }] })
          .mockRejectedValueOnce(new Error('Database error')), // Error will trigger ROLLBACK automatically if after BEGIN
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await expect(gstService.runGSTCheck({
        deliveryLineId: 'line-123',
        invoiceGstRate: 18.0,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('resolveGSTMismatch', () => {
    it('should resolve GST mismatch and update delivery line status', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get check details
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              is_mismatch: true,
              delivery_id: 'delivery-123',
              dc_id: 'dc-001'
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update gst_checks
          .mockResolvedValueOnce({ rows: [] }) // Update delivery_lines
          .mockResolvedValueOnce({ rows: [] }) // Insert audit_events
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await gstService.resolveGSTMismatch({
        checkId: 'check-123',
        resolverId: 'finance-user-123',
        resolverRole: 'Finance_User',
        deviceId: 'device-123',
        resolutionCode: 'APPROVED_BY_FINANCE'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Verify delivery_lines was updated to Resolved
      const updateCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('UPDATE delivery_lines') && call[0].includes('Resolved')
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

      await expect(gstService.resolveGSTMismatch({
        checkId: 'nonexistent',
        resolverId: 'finance-user-123',
        resolverRole: 'Finance_User',
        deviceId: 'device-123',
        resolutionCode: 'APPROVED_BY_FINANCE'
      })).rejects.toThrow('GST check not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw error if trying to resolve a non-mismatch check', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              check_id: 'check-123',
              delivery_line_id: 'line-123',
              is_mismatch: false,
              delivery_id: 'delivery-123',
              dc_id: 'dc-001'
            }]
          })
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await expect(gstService.resolveGSTMismatch({
        checkId: 'check-123',
        resolverId: 'finance-user-123',
        resolverRole: 'Finance_User',
        deviceId: 'device-123',
        resolutionCode: 'APPROVED_BY_FINANCE'
      })).rejects.toThrow('Cannot resolve a GST check that is not a mismatch');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
