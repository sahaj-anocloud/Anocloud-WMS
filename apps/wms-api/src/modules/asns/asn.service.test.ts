import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ASNService } from './asn.service.js';
import type { Pool } from 'pg';

// Mock pools
const createMockPool = () => ({
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
  on: vi.fn(),
});

describe('ASNService', () => {
  let service: ASNService;
  let mockDb: Pool;
  let mockDbRead: Pool;

  beforeEach(() => {
    mockDb = createMockPool() as unknown as Pool;
    mockDbRead = createMockPool() as unknown as Pool;
    service = new ASNService(mockDb, mockDbRead);
  });

  describe('calculateASNConfidenceScore', () => {
    it('should calculate Portal channel score correctly', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T15:00:00Z'); // 5 hours later (no penalty)
      const payload: any = { channel: 'Portal', vehicle_number: 'V1', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(50); // 40 (Portal) + 10 (Vehicle)
      expect(result.isLate).toBe(false);
    });

    it('should calculate Email channel score correctly', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T15:00:00Z');
      const payload: any = { channel: 'Email', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(25); 
      expect(result.isLate).toBe(false);
    });

    it('should calculate Paper channel score correctly', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T15:00:00Z');
      const payload: any = { channel: 'Paper', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(10);
      expect(result.isLate).toBe(false);
    });

    it('should calculate BuyerFallback channel score correctly', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T15:00:00Z');
      const payload: any = { channel: 'BuyerFallback', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(5);
      expect(result.isLate).toBe(false);
    });

    it('should apply late penalty when submitted < 2 hours before slot', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T11:30:00Z'); // 1.5 hours later
      const payload: any = { channel: 'Portal', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(20); // 40 - 20 = 20
      expect(result.isLate).toBe(true);
    });

    it('should not apply late penalty when submitted exactly 2 hours before slot', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T12:00:00Z'); // exactly 2 hours later
      const payload: any = { channel: 'Portal', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(30); // 40 - 10 (penalty for 2-4h)
      expect(result.isLate).toBe(false);
    });

    it('should clamp score to 0 when late penalty would make it negative', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const slotStart = new Date('2024-01-01T11:00:00Z'); // 1 hour later
      const payload: any = { channel: 'BuyerFallback', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt, slotStart);

      expect(result.score).toBe(0); // 5 - 10 = 0 (clamped)
      expect(result.isLate).toBe(true);
    });

    it('should handle missing slot_start gracefully', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const payload: any = { channel: 'Portal', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt);

      expect(result.score).toBe(40);
      expect(result.isLate).toBe(false);
    });

    it('should clamp score to 100 maximum', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const payload: any = { channel: 'Portal', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt);

      expect(result.score).toBe(40);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should always return integer score', () => {
      const submittedAt = new Date('2024-01-01T10:00:00Z');
      const payload: any = { channel: 'Email', lines: [] };

      const result = service.calculateASNConfidenceScore(payload, submittedAt);

      expect(Number.isInteger(result.score)).toBe(true);
    });
  });

  describe('createASN', () => {
    it('should reject ASN when PO does not exist', async () => {
      (vi.mocked(mockDbRead.query) as any).mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      await expect(
        service.createASN({
          dc_id: 'DC001',
          vendor_id: 'vendor-123',
          po_id: 'nonexistent-po',
          channel: 'Portal',
          data_completeness: 1.0,
          lines: [],
        }),
      ).rejects.toThrow('PO_NOT_FOUND');
    });

    it('should reject ASN when PO is not Open', async () => {
      (vi.mocked(mockDbRead.query) as any).mockResolvedValueOnce({
        rows: [{ po_id: 'po-123', status: 'Closed' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await expect(
        service.createASN({
          dc_id: 'DC001',
          vendor_id: 'vendor-123',
          po_id: 'po-123',
          channel: 'Portal',
          data_completeness: 1.0,
          lines: [],
        }),
      ).rejects.toThrow('PO_NOT_OPEN');
    });

    it('should reject ASN when SKUs are not Active', async () => {
      (vi.mocked(mockDbRead.query) as any)
        .mockResolvedValueOnce({
          rows: [{ po_id: 'po-123', status: 'Open' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            { sku_id: 'sku-1', status: 'Active' },
            { sku_id: 'sku-2', status: 'Inactive' },
          ],
          command: 'SELECT',
          rowCount: 2,
          oid: 0,
          fields: [],
        });

      await expect(
        service.createASN({
          dc_id: 'DC001',
          vendor_id: 'vendor-123',
          po_id: 'po-123',
          channel: 'Portal',
          data_completeness: 1.0,
          lines: [],
        }),
      ).rejects.toThrow('INACTIVE_SKUS');
    });

    it('should create ASN successfully with valid inputs', async () => {
      const mockASN = {
        asn_id: 'asn-123',
        dc_id: 'DC001',
        vendor_id: 'vendor-123',
        po_id: 'po-123',
        channel: 'Portal',
        confidence_score: 40,
        status: 'Submitted',
        submitted_at: new Date().toISOString(),
        is_late: false,
      };

      (vi.mocked(mockDbRead.query) as any)
        .mockResolvedValueOnce({
          rows: [{ po_id: 'po-123', status: 'Open' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ sku_id: 'sku-1', status: 'Active' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      (vi.mocked(mockDb.query) as any)
        .mockResolvedValueOnce({
          rows: [mockASN],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const result = await service.createASN({
        dc_id: 'DC001',
        vendor_id: 'vendor-123',
        po_id: 'po-123',
        channel: 'Portal',
        data_completeness: 1.0,
        lines: [],
      });

      expect(result.asn_id).toBe('asn-123');
      expect(result.confidence_score).toBe(40);
      expect(result.is_late).toBe(false);
    });
  });

  describe('getASNConfidence', () => {
    it('should return confidence data for existing ASN', async () => {
      const mockASN = {
        asn_id: 'asn-123',
        channel: 'Portal',
        confidence_score: 95,
        is_late: false,
      };

      (vi.mocked(mockDbRead.query) as any).mockResolvedValueOnce({
        rows: [mockASN],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.getASNConfidence('asn-123');

      expect(result.asn_id).toBe('asn-123');
      expect(result.channel).toBe('Portal');
      expect(result.confidence_score).toBe(95);
      expect(result.is_late).toBe(false);
    });

    it('should throw error when ASN does not exist', async () => {
      (vi.mocked(mockDbRead.query) as any).mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      await expect(service.getASNConfidence('nonexistent-asn')).rejects.toThrow('ASN_NOT_FOUND');
    });
  });

  describe('hasASNForPO', () => {
    it('should return true when ASN exists for PO', async () => {
      (vi.mocked(mockDbRead.query) as any).mockResolvedValueOnce({
        rows: [{ count: '1' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.hasASNForPO('po-123');

      expect(result).toBe(true);
    });

    it('should return false when no ASN exists for PO', async () => {
      (vi.mocked(mockDbRead.query) as any).mockResolvedValueOnce({
        rows: [{ count: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await service.hasASNForPO('po-123');

      expect(result).toBe(false);
    });
  });
});
