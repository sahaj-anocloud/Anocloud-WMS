import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReceivingService } from './receiving.service.js';
import type { Pool, PoolClient } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';

describe('ReceivingService', () => {
  let receivingService: ReceivingService;
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

    receivingService = new ReceivingService(mockDb, mockSqsClient);
  });

  describe('calculateRequiredScans (BR-07)', () => {
    it('should calculate SealedCarton scan count as max(1, ceil(batchSize * 0.05))', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ sampling_modifier: '1.0' }] } as any);
      expect(await receivingService.calculateRequiredScans('v-1', 'SealedCarton', 10)).toBe(1); // 10 * 0.05 = 0.5 -> ceil = 1
      
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ sampling_modifier: '1.0' }] } as any);
      expect(await receivingService.calculateRequiredScans('v-1', 'SealedCarton', 21)).toBe(2); // 21 * 0.05 = 1.05 -> ceil = 2
    });

    it('should return 1 for GunnyBag', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ sampling_modifier: '1.0' }] } as any);
      expect(await receivingService.calculateRequiredScans('v-1', 'GunnyBag', 10)).toBe(1);
    });

    it('should apply trust tier multiplier', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ sampling_modifier: '0.5' }] } as any);
      expect(await receivingService.calculateRequiredScans('v-1', 'ShrinkWrap', 10)).toBe(5); // 10 * 0.5 = 5
    });

    it('should throw error for unknown packaging class', async () => {
      vi.mocked(mockDb.query).mockResolvedValueOnce({ rows: [{ sampling_modifier: '1.0' }] } as any);
      await expect(receivingService.calculateRequiredScans('v-1', 'Unknown', 10)).rejects.toThrow('Unknown packaging class: Unknown');
    });
  });

  describe('submitScan', () => {
    it('should record Match scan result when barcode matches expected SKU', async () => {
      const mockLine = {
        line_id: 'line-1',
        sku_id: 'sku-1',
        sku_code: 'SKU001',
        completed_scans: 2,
        required_scans: 5,
        qc_status: 'Pending',
        packaging_class: 'SealedCarton',
      };

      const mockBarcode = { sku_id: 'sku-1' };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [mockBarcode] } as any) // validate barcode
        .mockResolvedValueOnce({ rows: [] } as any) // insert scan event
        .mockResolvedValueOnce({ rows: [] } as any) // increment completed_scans
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.submitScan({
        delivery_line_id: 'line-1',
        barcode: 'BAR001',
        scanned_by: 'user-1',
        device_id: 'device-1',
      });

      expect(result.scan_result).toBe('Match');
      expect(result.completed_scans).toBe(3);
      expect(result.required_scans).toBe(5);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should record Mismatch scan result and block line when barcode resolves to different SKU', async () => {
      const mockLine = {
        line_id: 'line-1',
        sku_id: 'sku-1',
        sku_code: 'SKU001',
        completed_scans: 2,
        required_scans: 5,
        qc_status: 'Pending',
        packaging_class: 'SealedCarton',
      };

      const mockBarcode = { sku_id: 'sku-2' }; // Different SKU

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [mockBarcode] } as any) // validate barcode
        .mockResolvedValueOnce({ rows: [] } as any) // block line
        .mockResolvedValueOnce({ rows: [] } as any) // insert scan event
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.submitScan({
        delivery_line_id: 'line-1',
        barcode: 'BAR002',
        scanned_by: 'user-1',
        device_id: 'device-1',
      });

      expect(result.scan_result).toBe('Mismatch');
      expect(result.completed_scans).toBe(2); // Not incremented
      expect(result.message).toContain('Barcode mismatch');
      expect(mockSqsClient.send).toHaveBeenCalled(); // Alert sent
    });

    it('should record Unexpected scan result when barcode not found in master', async () => {
      const mockLine = {
        line_id: 'line-1',
        sku_id: 'sku-1',
        sku_code: 'SKU001',
        completed_scans: 2,
        required_scans: 5,
        qc_status: 'Pending',
        packaging_class: 'SealedCarton',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [] } as any) // validate barcode - not found
        .mockResolvedValueOnce({ rows: [] } as any) // insert scan event
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.submitScan({
        delivery_line_id: 'line-1',
        barcode: 'UNKNOWN',
        scanned_by: 'user-1',
        device_id: 'device-1',
      });

      expect(result.scan_result).toBe('Unexpected');
      expect(result.completed_scans).toBe(2); // Not incremented
      expect(result.message).toBe('Barcode not found in SKU master');
    });
  });

  describe('qcPass', () => {
    it('should mark line as QC-passed when scan count is complete', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 5,
        required_scans: 5,
        qc_status: 'Pending',
        batch_number: 'BATCH001',
        expiry_date: '2025-12-31',
        sku_id: 'sku-1',
        category: 'FMCG_Food',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any) // sub-line count check
        .mockResolvedValueOnce({ rows: [] } as any) // update qc_status
        .mockResolvedValueOnce({ rows: [{ total_qty: '5' }] } as any) // quantity conservation check
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should return SCAN_COUNT_INCOMPLETE error when scans not complete', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 3,
        required_scans: 5,
        qc_status: 'Pending',
        batch_number: 'BATCH001',
        expiry_date: '2025-12-31',
        sku_id: 'sku-1',
        category: 'FMCG_Food',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any); // get delivery line

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('SCAN_COUNT_INCOMPLETE');
      expect(result.message).toContain('3/5');
    });

    it('should return error when line is blocked', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 5,
        required_scans: 5,
        qc_status: 'Blocked',
        batch_number: 'BATCH001',
        expiry_date: '2025-12-31',
        sku_id: 'sku-1',
        category: 'FMCG_Food',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any); // get delivery line

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('blocked');
    });

    it('should return BATCH_MISSING error for FMCG_Food without batch number', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 5,
        required_scans: 5,
        qc_status: 'Pending',
        batch_number: null,
        expiry_date: '2025-12-31',
        sku_id: 'sku-1',
        category: 'FMCG_Food',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any); // sub-line count check (NONE FOUND)

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('BATCH_MISSING');
      expect(result.message).toContain('FMCG_Food');
    });

    it('should return BATCH_MISSING error for BDF without expiry date', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 5,
        required_scans: 5,
        qc_status: 'Pending',
        batch_number: 'BATCH001',
        expiry_date: null,
        sku_id: 'sku-1',
        category: 'BDF',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any); // sub-line count check (NONE FOUND)

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('BATCH_MISSING');
      expect(result.message).toContain('BDF');
    });

    it('should return BATCH_MISSING error for Fresh without batch capture', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 5,
        required_scans: 5,
        qc_status: 'Pending',
        batch_number: null,
        expiry_date: null,
        sku_id: 'sku-1',
        category: 'Fresh',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any); // sub-line count check (NONE FOUND)

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('BATCH_MISSING');
    });

    it('should allow QC-pass for non-mandated categories without batch capture', async () => {
      const mockLine = {
        line_id: 'line-1',
        completed_scans: 5,
        required_scans: 5,
        qc_status: 'Pending',
        batch_number: null,
        expiry_date: null,
        sku_id: 'sku-1',
        category: 'Chocolate', // Not mandated
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get delivery line
        .mockResolvedValueOnce({ rows: [] } as any) // update qc_status
        .mockResolvedValueOnce({ rows: [{ total_qty: '5' }] } as any) // quantity conservation check
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.qcPass({
        line_id: 'line-1',
        user_id: 'user-1',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('captureSubLine', () => {
    it('should capture sub-line with batch number and expiry date', async () => {
      const mockLine = { line_id: 'line-1', expected_qty: '100', qc_status: 'Pending', category: 'FMCG_Food' };
      const mockSub = { sub_line_id: 'sub-1', line_id: 'line-1', batch_number: 'B1', expiry_date: '2026-12-31', quantity: '50', captured_at: new Date().toISOString() };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockLine] } as any) // get line
        .mockResolvedValueOnce({ rows: [mockSub] } as any) // insert sub-line
        .mockResolvedValueOnce({ rows: [{ total_qty: '50' }] } as any) // get totals
        .mockResolvedValueOnce({ rows: [] } as any) // update received_qty
        .mockResolvedValueOnce({ rows: [] } as any) // audit
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.captureSubLine({
        line_id: 'line-1',
        batch_number: 'B1',
        expiry_date: '2026-12-31',
        quantity: 50,
        captured_by: 'u1',
        device_id: 'd1'
      });

      expect(result.sub_line_id).toBe('sub-1');
      expect(result.total_captured_qty).toBe(50);
      expect(result.is_complete).toBe(false);
    });
  });

  describe('startReceiving', () => {
    it('should start receiving and return ASN line items', async () => {
      const mockItems = [
        {
          sku_id: 'sku-1',
          sku_code: 'SKU001',
          name: 'Product 1',
          packaging_class: 'SealedCarton',
          is_ft: true,
          requires_cold: false,
          expected_qty: 100,
        },
      ];

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // update yard entry
        .mockResolvedValueOnce({ rows: [] } as any) // check delivery exists
        .mockResolvedValueOnce({ rows: [{ asn_id: 'asn-1' }] } as any) // get yard entry
        .mockResolvedValueOnce({ rows: [{ delivery_id: 'delivery-1' }] } as any) // insert delivery
        .mockResolvedValueOnce({ rows: mockItems } as any) // get items
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.startReceiving({
        delivery_id: 'delivery-1',
        yard_entry_id: 'entry-1',
      });

      expect(result.delivery_id).toBe('delivery-1');
      expect(result.items).toEqual(mockItems);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if yard entry has no ASN', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // update yard entry
        .mockResolvedValueOnce({ rows: [] } as any) // check delivery exists
        .mockResolvedValueOnce({ rows: [] } as any); // get yard entry - not found

      await expect(
        receivingService.startReceiving({
          delivery_id: 'delivery-1',
          yard_entry_id: 'entry-1',
        })
      ).rejects.toThrow('Yard entry not found or has no ASN');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('assignStagingLane', () => {
    it('should assign FT items to FT lane', async () => {
      const mockSku = {
        sku_id: 'sku-1',
        is_ft: true,
        requires_cold: false,
        status: 'Active',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockSku] } as any) // get SKU
        .mockResolvedValueOnce({ rows: [] } as any) // update delivery line
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.assignStagingLane(
        'sku-1',
        'barcode-1',
        'line-1'
      );

      expect(result).toBe('FT');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should assign NFT items to NFT lane', async () => {
      const mockSku = {
        sku_id: 'sku-1',
        is_ft: false,
        requires_cold: false,
        status: 'Active',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockSku] } as any) // get SKU
        .mockResolvedValueOnce({ rows: [] } as any) // update delivery line
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.assignStagingLane(
        'sku-1',
        'barcode-1',
        'line-1'
      );

      expect(result).toBe('NFT');
    });

    it('should assign cold-chain items to ColdZone immediately (BR-18)', async () => {
      const mockSku = {
        sku_id: 'sku-1',
        is_ft: false,
        requires_cold: true,
        status: 'Active',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockSku] } as any) // get SKU
        .mockResolvedValueOnce({ rows: [] } as any) // update delivery line
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.assignStagingLane(
        'sku-1',
        'barcode-1',
        'line-1'
      );

      expect(result).toBe('ColdZone');
    });

    it('should assign unrecognised items to Unexpected lane and alert', async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as any) // get SKU - not found
        .mockResolvedValueOnce({ rows: [] } as any) // update delivery line
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.assignStagingLane(
        'sku-unknown',
        'barcode-1',
        'line-1'
      );

      expect(result).toBe('Unexpected');
      expect(mockSqsClient.send).toHaveBeenCalled();
    });

    it('should assign inactive SKU to Unexpected lane', async () => {
      const mockSku = {
        sku_id: 'sku-1',
        is_ft: true,
        requires_cold: false,
        status: 'Inactive',
      };

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockSku] } as any) // get SKU
        .mockResolvedValueOnce({ rows: [] } as any) // update delivery line
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await receivingService.assignStagingLane(
        'sku-1',
        'barcode-1',
        'line-1'
      );

      expect(result).toBe('Unexpected');
    });
  });
});
