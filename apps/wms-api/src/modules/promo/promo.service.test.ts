import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromoService } from './promo.service';
import { Pool } from 'pg';

describe('PromoService', () => {
  let promoService: PromoService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      connect: vi.fn(),
      query: vi.fn()
    };
    promoService = new PromoService(mockDb as unknown as Pool);
  });

  describe('getPromoInfo', () => {
    it('should return Case1 promo info with correct instruction', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          line_id: 'line-123',
          promo_type: 'Case1',
          sku_id: 'sku-123',
          sku_name: 'Test Product'
        }]
      });

      const result = await promoService.getPromoInfo('line-123', 'dc-001');

      expect(result.promoType).toBe('Case1');
      expect(result.instruction).toContain('On-pack promotional item');
      expect(result.instruction).toContain('primary SKU price');
    });

    it('should return Case2 promo info with correct instruction', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          line_id: 'line-123',
          promo_type: 'Case2',
          sku_id: 'sku-123',
          sku_name: 'Test Product'
        }]
      });

      const result = await promoService.getPromoInfo('line-123', 'dc-001');

      expect(result.promoType).toBe('Case2');
      expect(result.instruction).toContain('Same-SKU free');
      expect(result.instruction).toContain('zero cost');
    });

    it('should return Case3 promo info with correct instruction', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          line_id: 'line-123',
          promo_type: 'Case3',
          sku_id: 'sku-123',
          sku_name: 'Test Product'
        }]
      });

      const result = await promoService.getPromoInfo('line-123', 'dc-001');

      expect(result.promoType).toBe('Case3');
      expect(result.instruction).toContain('Different-SKU free');
      expect(result.instruction).toContain('Rs 0.01');
    });

    it('should return standard receiving instruction for non-promo items', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          line_id: 'line-123',
          promo_type: null,
          sku_id: 'sku-123',
          sku_name: 'Test Product'
        }]
      });

      const result = await promoService.getPromoInfo('line-123', 'dc-001');

      expect(result.promoType).toBeNull();
      expect(result.instruction).toContain('Standard receiving');
    });
  });

  describe('processPromoReceiving - Case1', () => {
    it('should process Case1 promo as single unit with primary SKU price', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get line details
            rows: [{
              line_id: 'line-123',
              promo_type: 'Case1',
              sku_id: 'sku-123',
              po_line_id: 'po-line-123',
              delivery_id: 'delivery-123',
              dc_id: 'dc-001',
              unit_price: 50.00
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update received_qty
          .mockResolvedValueOnce({ rows: [] }) // Insert audit event
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await promoService.processPromoReceiving({
        deliveryLineId: 'line-123',
        receivedQty: 100,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Verify received_qty was updated
      const updateCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('UPDATE delivery_lines') && call[0].includes('received_qty')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([100, 'line-123']);
    });
  });

  describe('processPromoReceiving - Case2', () => {
    it('should process Case2 promo with free units at zero cost', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get line details
            rows: [{
              line_id: 'line-123',
              promo_type: 'Case2',
              sku_id: 'sku-123',
              po_line_id: 'po-line-123',
              delivery_id: 'delivery-123',
              dc_id: 'dc-001',
              unit_price: 50.00
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update received_qty with total
          .mockResolvedValueOnce({ rows: [] }) // Insert free qty audit event
          .mockResolvedValueOnce({ rows: [] }) // Insert main audit event
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await promoService.processPromoReceiving({
        deliveryLineId: 'line-123',
        receivedQty: 100,
        freeQty: 20,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Verify total quantity (invoiced + free) was updated
      const updateCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('UPDATE delivery_lines') && call[0].includes('received_qty')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe(120); // 100 + 20
      
      // Verify free qty audit event with Rs 0.00 cost
      const freeQtyAuditCall = mockClient.query.mock.calls.find((call: any) => 
        call[1] && call[1][1] === 'PROMO_CASE2_FREE_QTY'
      );
      expect(freeQtyAuditCall).toBeDefined();
      const auditPayload = JSON.parse(freeQtyAuditCall[1][5]);
      expect(auditPayload.freeUnitCost).toBe(0.00);
    });

    it('should throw error if freeQty is missing for Case2', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get line details
            rows: [{
              line_id: 'line-123',
              promo_type: 'Case2',
              sku_id: 'sku-123',
              po_line_id: 'po-line-123',
              delivery_id: 'delivery-123',
              dc_id: 'dc-001',
              unit_price: 50.00
            }]
          })
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await expect(promoService.processPromoReceiving({
        deliveryLineId: 'line-123',
        receivedQty: 100,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('Free quantity is required for Case 2 promotional items');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('processPromoReceiving - Case3', () => {
    it('should process Case3 promo with separate inventory record at Rs 0.01', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get line details
            rows: [{
              line_id: 'line-123',
              promo_type: 'Case3',
              sku_id: 'sku-123',
              po_line_id: 'po-line-123',
              delivery_id: 'delivery-123',
              dc_id: 'dc-001',
              unit_price: 50.00
            }]
          })
          .mockResolvedValueOnce({ rows: [] }) // Update primary SKU received_qty
          .mockResolvedValueOnce({ rows: [{ sku_id: 'free-sku-123' }] }) // Get free SKU
          .mockResolvedValueOnce({ rows: [] }) // Insert separate delivery_lines for free SKU
          .mockResolvedValueOnce({ rows: [] }) // Insert free SKU audit event
          .mockResolvedValueOnce({ rows: [] }) // Insert main audit event
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await promoService.processPromoReceiving({
        deliveryLineId: 'line-123',
        receivedQty: 100,
        freeQty: 10,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Verify separate delivery_lines record was created
      const insertCall = mockClient.query.mock.calls.find((call: any) => 
        call[0].includes('INSERT INTO delivery_lines')
      );
      expect(insertCall).toBeDefined();
      
      // Verify Rs 0.01 pricing in audit event
      const freeSkuAuditCall = mockClient.query.mock.calls.find((call: any) => 
        call[1] && call[1][1] === 'PROMO_CASE3_FREE_SKU'
      );
      expect(freeSkuAuditCall).toBeDefined();
      const auditPayload = JSON.parse(freeSkuAuditCall[1][5]);
      expect(auditPayload.unitCost).toBe(0.01);
    });

    it('should throw error if freeQty is missing for Case3', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ // Get line details
            rows: [{
              line_id: 'line-123',
              promo_type: 'Case3',
              sku_id: 'sku-123',
              po_line_id: 'po-line-123',
              delivery_id: 'delivery-123',
              dc_id: 'dc-001',
              unit_price: 50.00
            }]
          })
          .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
        release: vi.fn()
      };

      mockDb.connect.mockResolvedValue(mockClient);

      await expect(promoService.processPromoReceiving({
        deliveryLineId: 'line-123',
        receivedQty: 100,
        dcId: 'dc-001',
        userId: 'user-123',
        deviceId: 'device-123'
      })).rejects.toThrow('Free quantity is required for Case 3 promotional items');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
