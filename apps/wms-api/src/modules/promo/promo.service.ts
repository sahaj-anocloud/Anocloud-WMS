import { Pool } from 'pg';

export type PromoType = 'Case1' | 'Case2' | 'Case3' | null;

export interface PromoItemInfo {
  deliveryLineId: string;
  promoType: PromoType;
  instruction: string;
  primarySkuId?: string;
  freeSkuId?: string;
  freeQuantity?: number;
}

export interface PromoReceivingRequest {
  deliveryLineId: string;
  receivedQty: number;
  freeQty?: number;
  dcId: string;
  userId: string;
  deviceId: string;
}

export class PromoService {
  constructor(private db: Pool) {}

  /**
   * Get promotional item information for a delivery line
   * Returns the promo type and receiving instructions
   */
  async getPromoInfo(deliveryLineId: string, dcId: string): Promise<PromoItemInfo> {
    const result = await this.db.query(
      `SELECT dl.line_id, dl.promo_type, dl.sku_id, s.name as sku_name
       FROM delivery_lines dl
       JOIN skus s ON dl.sku_id = s.sku_id
       WHERE dl.line_id = $1 AND dl.delivery_id IN (
         SELECT delivery_id FROM deliveries WHERE dc_id = $2
       )`,
      [deliveryLineId, dcId]
    );

    if (result.rows.length === 0) {
      throw new Error('Delivery line not found or access denied');
    }

    const line = result.rows[0];
    const promoType = line.promo_type as PromoType;

    let instruction = '';
    switch (promoType) {
      case 'Case1':
        instruction = 'On-pack promotional item: Receive as single unit with primary SKU at primary SKU price';
        break;
      case 'Case2':
        instruction = 'Same-SKU free promotional item: Add free units to received quantity. Free units will be posted at zero cost.';
        break;
      case 'Case3':
        instruction = 'Different-SKU free promotional item: Separate inventory record will be created at Rs 0.01 per unit';
        break;
      default:
        instruction = 'Standard receiving - no promotional handling';
    }

    return {
      deliveryLineId: line.line_id,
      promoType,
      instruction,
      primarySkuId: line.sku_id
    };
  }

  /**
   * Process promotional item receiving
   * Handles Cases 1, 2, and 3 according to business rules
   */
  async processPromoReceiving(request: PromoReceivingRequest): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get delivery line details
      const lineResult = await client.query(
        `SELECT dl.line_id, dl.promo_type, dl.sku_id, dl.po_line_id, dl.delivery_id,
                d.dc_id, pol.unit_price
         FROM delivery_lines dl
         JOIN deliveries d ON dl.delivery_id = d.delivery_id
         JOIN po_lines pol ON dl.po_line_id = pol.po_line_id
         WHERE dl.line_id = $1 AND d.dc_id = $2`,
        [request.deliveryLineId, request.dcId]
      );

      if (lineResult.rows.length === 0) {
        throw new Error('Delivery line not found or access denied');
      }

      const line = lineResult.rows[0];
      const promoType = line.promo_type as PromoType;

      switch (promoType) {
        case 'Case1':
          // On-pack: receive as single unit with primary SKU at primary SKU price
          await this.processCase1(client, line, request);
          break;
        case 'Case2':
          // Same-SKU free: add free units to received_qty; post GRPO with zero cost for free units
          await this.processCase2(client, line, request);
          break;
        case 'Case3':
          // Different-SKU free: create separate delivery_lines record for free SKU at Rs 0.01
          await this.processCase3(client, line, request);
          break;
        default:
          // Standard receiving
          await client.query(
            `UPDATE delivery_lines SET received_qty = $1 WHERE line_id = $2`,
            [request.receivedQty, request.deliveryLineId]
          );
      }

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          request.dcId,
          'PROMO_RECEIVING',
          request.userId,
          request.deviceId,
          request.deliveryLineId,
          JSON.stringify({
            promoType,
            receivedQty: request.receivedQty,
            freeQty: request.freeQty
          }),
          `Promotional item received: ${promoType || 'Standard'}`
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process Case 1: On-pack promotional item
   * Receive as single unit with primary SKU at primary SKU price
   */
  private async processCase1(client: any, line: any, request: PromoReceivingRequest): Promise<void> {
    // Update received quantity - treat as single unit
    await client.query(
      `UPDATE delivery_lines SET received_qty = $1 WHERE line_id = $2`,
      [request.receivedQty, request.deliveryLineId]
    );

    // No special pricing handling needed - uses primary SKU price from PO
  }

  /**
   * Process Case 2: Same-SKU free promotional item
   * Add free units to received_qty; post GRPO with zero cost for free units
   */
  private async processCase2(client: any, line: any, request: PromoReceivingRequest): Promise<void> {
    if (!request.freeQty || request.freeQty <= 0) {
      throw new Error('Free quantity is required for Case 2 promotional items');
    }

    // Update received quantity to include free units
    const totalQty = request.receivedQty + request.freeQty;
    await client.query(
      `UPDATE delivery_lines 
       SET received_qty = $1,
           promo_type = 'Case2'
       WHERE line_id = $2`,
      [totalQty, request.deliveryLineId]
    );

    // Store free quantity in audit for GRPO posting
    // The GRPO posting logic will use this to post free units at Rs 0.00
    await client.query(
      `INSERT INTO audit_events (
        dc_id, event_type, user_id, device_id, occurred_at,
        reference_doc, new_state, reason_code
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
      [
        line.dc_id,
        'PROMO_CASE2_FREE_QTY',
        request.userId,
        request.deviceId,
        request.deliveryLineId,
        JSON.stringify({
          invoicedQty: request.receivedQty,
          freeQty: request.freeQty,
          totalQty: totalQty,
          unitPrice: parseFloat(line.unit_price),
          freeUnitCost: 0.00
        }),
        `Case 2 promo: ${request.freeQty} free units at Rs 0.00`
      ]
    );
  }

  /**
   * Process Case 3: Different-SKU free promotional item
   * Create separate delivery_lines record for free SKU at Rs 0.01
   */
  private async processCase3(client: any, line: any, request: PromoReceivingRequest): Promise<void> {
    if (!request.freeQty || request.freeQty <= 0) {
      throw new Error('Free quantity is required for Case 3 promotional items');
    }

    // Update primary SKU received quantity
    await client.query(
      `UPDATE delivery_lines SET received_qty = $1 WHERE line_id = $2`,
      [request.receivedQty, request.deliveryLineId]
    );

    // Get free SKU ID from PO/ASN metadata (simplified - in real implementation, this would come from PO/ASN)
    // For now, we'll create a placeholder entry
    const freeSkuResult = await client.query(
      `SELECT sku_id FROM skus WHERE dc_id = $1 AND sku_code LIKE '%FREE%' LIMIT 1`,
      [line.dc_id]
    );

    if (freeSkuResult.rows.length === 0) {
      throw new Error('Free SKU not found for Case 3 promotional item');
    }

    const freeSkuId = freeSkuResult.rows[0].sku_id;

    // Create separate delivery_lines record for free SKU at Rs 0.01
    await client.query(
      `INSERT INTO delivery_lines (
        delivery_id, po_line_id, sku_id, expected_qty, received_qty,
        packaging_class, required_scans, completed_scans,
        qc_status, gkm_status, gst_status, promo_type
      )
      SELECT 
        $1, po_line_id, $2, $3, $3,
        packaging_class, 0, 0,
        'Passed', 'AutoAccepted', 'Matched', 'Case3'
      FROM delivery_lines
      WHERE line_id = $4`,
      [line.delivery_id, freeSkuId, request.freeQty, request.deliveryLineId]
    );

    // Record the Rs 0.01 pricing for GRPO posting
    await client.query(
      `INSERT INTO audit_events (
        dc_id, event_type, user_id, device_id, occurred_at,
        reference_doc, new_state, reason_code
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
      [
        line.dc_id,
        'PROMO_CASE3_FREE_SKU',
        request.userId,
        request.deviceId,
        request.deliveryLineId,
        JSON.stringify({
          freeSkuId: freeSkuId,
          freeQty: request.freeQty,
          unitCost: 0.01
        }),
        `Case 3 promo: ${request.freeQty} units of free SKU at Rs 0.01`
      ]
    );
  }
}
