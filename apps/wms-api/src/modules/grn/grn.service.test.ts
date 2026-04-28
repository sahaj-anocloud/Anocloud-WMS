import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GRNService } from './grn.service';
import { Pool } from 'pg';
import axios from 'axios';

vi.mock('axios');

describe('GRNService', () => {
  let grnService: GRNService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      connect: vi.fn(),
      query: vi.fn()
    };
    grnService = new GRNService(mockDb as unknown as Pool);
    vi.clearAllMocks();
  });

  describe('checkAutoGRNEligibility', () => {
    it('should return true when all lines are ready', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '3', ready_lines: '3' }]
      });

      const result = await grnService.checkAutoGRNEligibility('delivery-123', 'dc-001');
      expect(result).toBe(true);
    });

    it('should return false when not all lines are ready', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '3', ready_lines: '2' }]
      });

      const result = await grnService.checkAutoGRNEligibility('delivery-123', 'dc-001');
      expect(result).toBe(false);
    });

    it('should return false when there are no lines', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '0', ready_lines: '0' }]
      });

      const result = await grnService.checkAutoGRNEligibility('delivery-123', 'dc-001');
      expect(result).toBe(false);
    });
  });

  describe('initiateAutoGRN', () => {
    it('should successfully initiate Auto-GRN and post to SAP', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ status: 'PendingGRN', grpo_doc_number: null }] }) // Get delivery status
          .mockResolvedValueOnce({ rows: [] }) // Update to GRNInProgress
          .mockResolvedValueOnce({ // Get delivery lines
            rows: [{
              line_id: 'line-1',
              sku_id: 'sku-1',
              po_line_id: 'po-line-1',
              received_qty: 100,
              unit_price: 50.00,
              gst_rate: 18.0,
              promo_type: null
            }]
          })
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      const successClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // Update delivery
          .mockResolvedValueOnce({ rows: [] }) // Insert audit event
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect
        .mockResolvedValueOnce(mockClient)
        .mockResolvedValueOnce(successClient);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '1', ready_lines: '1' }]
      });

      // Mock successful SAP response
      const sapResponse = {
        data: {
          grpoDocNumber: 'GRPO-2024-001',
          postingTimestamp: new Date().toISOString(),
          sapResponse: { status: 'success' }
        }
      };
      vi.mocked(axios.post).mockResolvedValueOnce(sapResponse);

      await grnService.initiateAutoGRN({
        deliveryId: 'delivery-123',
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/internal/sap/grpo'),
        expect.objectContaining({
          deliveryId: 'delivery-123',
          dcId: 'dc-001'
        }),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should throw error if delivery is not eligible', async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn()
      };
      mockDb.connect.mockResolvedValueOnce(mockClient);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '3', ready_lines: '2' }]
      });

      await expect(grnService.initiateAutoGRN({
        deliveryId: 'delivery-123',
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('Delivery is not eligible for Auto-GRN');
    });

    it('should throw error if GRPO already posted (duplicate prevention)', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ status: 'GRNComplete', grpo_doc_number: 'GRPO-001' }] })
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValueOnce(mockClient);
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '1', ready_lines: '1' }]
      });

      await expect(grnService.initiateAutoGRN({
        deliveryId: 'delivery-123',
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('GRPO already posted for this delivery');
    });

    it('should retry on SAP failure and eventually fail after max retries', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ status: 'PendingGRN', grpo_doc_number: null }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{
              line_id: 'line-1',
              sku_id: 'sku-1',
              po_line_id: 'po-line-1',
              received_qty: 100,
              unit_price: 50.00,
              gst_rate: 18.0,
              promo_type: null
            }]
          })
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      const failureClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // Update to PendingGRN
          .mockResolvedValueOnce({ rows: [] }) // Insert audit event
          .mockResolvedValueOnce({ rows: [] }) // Insert alert
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect
        .mockResolvedValueOnce(mockClient)
        .mockResolvedValueOnce(failureClient);

      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_lines: '1', ready_lines: '1' }]
      });

      // Mock SAP failures
      vi.mocked(axios.post).mockRejectedValue(new Error('SAP timeout'));

      await expect(grnService.initiateAutoGRN({
        deliveryId: 'delivery-123',
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('SAP GRPO failed after 4 attempts');

      // Verify 4 retry attempts were made
      expect(axios.post).toHaveBeenCalledTimes(4);
    }, 300000); // Increase timeout for retry test
  });

  describe('getGRNStatus', () => {
    it('should return GRN status with delivery and line details', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            delivery_id: 'delivery-123',
            status: 'GRNComplete',
            grpo_doc_number: 'GRPO-001',
            grpo_posted_at: new Date(),
            liability_ts: new Date()
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              line_id: 'line-1',
              sku_id: 'sku-1',
              qc_status: 'Passed',
              gkm_status: 'AutoAccepted',
              gst_status: 'Matched'
            },
            {
              line_id: 'line-2',
              sku_id: 'sku-2',
              qc_status: 'Passed',
              gkm_status: 'Approved',
              gst_status: 'Resolved'
            }
          ]
        });

      const result = await grnService.getGRNStatus('delivery-123', 'dc-001');

      expect(result.deliveryId).toBe('delivery-123');
      expect(result.status).toBe('GRNComplete');
      expect(result.grpoDocNumber).toBe('GRPO-001');
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]?.qcStatus).toBe('Passed');
    });

    it('should throw error if delivery not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(grnService.getGRNStatus('nonexistent', 'dc-001'))
        .rejects.toThrow('Delivery not found or access denied');
    });
  });
});

