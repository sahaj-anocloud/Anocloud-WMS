import { Pool } from 'pg';

export interface GKMCheckRequest {
  deliveryLineId: string;
  invoiceUnitPrice: number;
  dcId: string;
  userId: string;
  deviceId: string;
}

export interface GKMCheckResult {
  checkId: string;
  deliveryLineId: string;
  poUnitPrice: number;
  invoiceUnitPrice: number;
  variancePct: number;
  tier: 'AutoAccept' | 'SoftStop' | 'HardStop';
  checkedAt: Date;
}

export interface GKMApprovalRequest {
  checkId: string;
  approverId: string;
  approverRole: string; // Item #9.3
  deviceId: string;
}

export class GKMService {
  constructor(private db: Pool) {}

  /**
   * Calculate GKM variance percentage
   * Formula: abs(invoicePrice - poPrice) / poPrice * 100
   */
  gkmVariancePct(invoicePrice: number, poPrice: number): number {
    if (poPrice === 0) {
      throw new Error('PO price cannot be zero');
    }
    return (Math.abs(invoicePrice - poPrice) / poPrice) * 100;
  }

  /**
   * Determine GKM tier based on variance percentage
   * <= 0.1% → AutoAccept
   * <= 0.5% → SoftStop
   * > 0.5% → HardStop
   */
  gkmTier(variancePct: number): 'AutoAccept' | 'SoftStop' | 'HardStop' {
    if (variancePct <= 0.1) {
      return 'AutoAccept';
    } else if (variancePct <= 0.5) {
      return 'SoftStop';
    } else {
      return 'HardStop';
    }
  }

  /**
   * Run GKM check for a delivery line
   * Writes gkm_checks record and updates delivery_lines.gkm_status
   */
  async runGKMCheck(request: GKMCheckRequest): Promise<GKMCheckResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get PO unit price for the delivery line
      const lineResult = await client.query(
        `SELECT dl.line_id, dl.delivery_id, pol.unit_price as po_unit_price
         FROM delivery_lines dl
         JOIN po_lines pol ON dl.po_line_id = pol.po_line_id
         WHERE dl.line_id = $1 AND dl.delivery_id IN (
           SELECT delivery_id FROM deliveries WHERE dc_id = $2
         )`,
        [request.deliveryLineId, request.dcId]
      );

      if (lineResult.rows.length === 0) {
        throw new Error('Delivery line not found or access denied');
      }

      const { po_unit_price } = lineResult.rows[0];

      // Calculate variance and tier
      const variancePct = this.gkmVariancePct(request.invoiceUnitPrice, po_unit_price);
      const tier = this.gkmTier(variancePct);

      // Insert gkm_checks record
      const checkResult = await client.query(
        `INSERT INTO gkm_checks (
          delivery_line_id, po_unit_price, invoice_unit_price, 
          variance_pct, tier, checked_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING check_id, delivery_line_id, po_unit_price, 
                  invoice_unit_price, variance_pct, tier, checked_at`,
        [request.deliveryLineId, po_unit_price, request.invoiceUnitPrice, variancePct, tier]
      );

      const check = checkResult.rows[0];

      // Update delivery_lines.gkm_status
      let gkmStatus: string;
      if (tier === 'AutoAccept') {
        gkmStatus = 'AutoAccepted';
      } else if (tier === 'SoftStop') {
        gkmStatus = 'SoftStop';
      } else {
        gkmStatus = 'HardStop';
      }

      await client.query(
        `UPDATE delivery_lines SET gkm_status = $1 WHERE line_id = $2`,
        [gkmStatus, request.deliveryLineId]
      );

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          request.dcId,
          'GKM_CHECK',
          request.userId,
          request.deviceId,
          check.check_id,
          JSON.stringify({
            variancePct: variancePct,
            tier: tier,
            poUnitPrice: po_unit_price,
            invoiceUnitPrice: request.invoiceUnitPrice
          }),
          `GKM check performed: ${tier}`
        ]
      );

      // If HardStop, send alerts to Finance_User and BnM_User
      if (tier === 'HardStop') {
        await this.publishAlert(client, {
          dcId: request.dcId,
          alertType: 'GKM_HARD_STOP',
          severity: 'Critical',
          referenceDoc: check.check_id,
          payload: {
            deliveryLineId: request.deliveryLineId,
            variancePct: variancePct,
            poUnitPrice: po_unit_price,
            invoiceUnitPrice: request.invoiceUnitPrice
          }
        });
      }

      await client.query('COMMIT');

      return {
        checkId: check.check_id,
        deliveryLineId: check.delivery_line_id,
        poUnitPrice: parseFloat(check.po_unit_price),
        invoiceUnitPrice: parseFloat(check.invoice_unit_price),
        variancePct: parseFloat(check.variance_pct),
        tier: check.tier,
        checkedAt: check.checked_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve a GKM check (SoftStop or HardStop)
   * SoftStop: requires Inbound_Supervisor
   * HardStop: requires SCM_Head
   */
  async approveGKMCheck(request: GKMApprovalRequest): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get check details
      const checkResult = await client.query(
        `SELECT gc.check_id, gc.tier, gc.delivery_line_id, gc.variance_pct,
                dl.delivery_id, d.dc_id
         FROM gkm_checks gc
         JOIN delivery_lines dl ON gc.delivery_line_id = dl.line_id
         JOIN deliveries d ON dl.delivery_id = d.delivery_id
         WHERE gc.check_id = $1`,
        [request.checkId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('GKM check not found');
      }

      const check = checkResult.rows[0];

      // Role-based block (Item 9.3)
      if (check.tier === 'HardStop' && request.approverRole !== 'SCM_Head') {
        throw new Error(`AUTHORITY_EXCEEDED: Variance >0.5% (HardStop) requires SCM_Head approval. Escalating...`);
      }
      if (check.tier === 'SoftStop' && !['Inbound_Supervisor', 'SCM_Head'].includes(request.approverRole)) {
        throw new Error(`AUTHORITY_EXCEEDED: Variance >0.1% (SoftStop) requires Inbound_Supervisor approval.`);
      }

      // Update gkm_checks with approver
      await client.query(
        `UPDATE gkm_checks 
         SET approver_id = $1, approved_at = NOW()
         WHERE check_id = $2`,
        [request.approverId, request.checkId]
      );

      // Update delivery_lines.gkm_status to Approved
      await client.query(
        `UPDATE delivery_lines SET gkm_status = 'Approved' WHERE line_id = $1`,
        [check.delivery_line_id]
      );

      // Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          check.dc_id,
          'GKM_APPROVAL',
          request.approverId,
          request.deviceId,
          request.checkId,
          JSON.stringify({
            tier: check.tier,
            variancePct: parseFloat(check.variance_pct),
            deliveryLineId: check.delivery_line_id
          }),
          `GKM ${check.tier} approved`
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
   * Propose an MRP change for a SKU during receiving.
   * Requirement 9, AC 7: Recalculates GKM variance and blocks change if tolerance tier is breached.
   */
  async proposeMRPChange(request: {
    deliveryLineId: string;
    skuId: string;
    newMRP: number;
    invoiceUnitPrice: number;
    dcId: string;
    userId: string;
    deviceId: string;
    userRole: string; // Used to check against SoftStop/HardStop thresholds
    reasonCode: string;
  }): Promise<GKMCheckResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // 1. Get PO unit price
      const lineResult = await client.query(
        `SELECT dl.line_id, dl.delivery_id, pol.unit_price as po_unit_price
         FROM delivery_lines dl
         JOIN po_lines pol ON dl.po_line_id = pol.po_line_id
         WHERE dl.line_id = $1`,
        [request.deliveryLineId]
      );

      if (lineResult.rows.length === 0) {
        throw new Error('Delivery line not found');
      }

      const { po_unit_price } = lineResult.rows[0];

      // 2. Calculate variance and tier
      const variancePct = this.gkmVariancePct(request.invoiceUnitPrice, po_unit_price);
      const tier = this.gkmTier(variancePct);

      // 3. Check if user role matches tier requirements (Block if breached)
      if (tier === 'HardStop' && request.userRole !== 'SCM_Head') {
        throw new Error(`MRP_CHANGE_BLOCKED: GKM variance is ${variancePct.toFixed(2)}% (HardStop). SCM_Head approval required.`);
      }
      if (tier === 'SoftStop' && !['Inbound_Supervisor', 'SCM_Head'].includes(request.userRole)) {
        throw new Error(`MRP_CHANGE_BLOCKED: GKM variance is ${variancePct.toFixed(2)}% (SoftStop). Inbound_Supervisor approval required.`);
      }

      // 4. Update SKU master MRP
      await client.query(
        `UPDATE skus SET mrp = $1 WHERE sku_id = $2`,
        [request.newMRP, request.skuId]
      );

      // 5. Insert GKM check and update line status
      const gkmStatus = tier === 'AutoAccept' ? 'AutoAccepted' : 'Approved';
      
      const checkResult = await client.query(
        `INSERT INTO gkm_checks (
          delivery_line_id, po_unit_price, invoice_unit_price, 
          variance_pct, tier, approver_id, approved_at, checked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *`,
        [
          request.deliveryLineId, 
          po_unit_price, 
          request.invoiceUnitPrice, 
          variancePct, 
          tier, 
          tier !== 'AutoAccept' ? request.userId : null
        ]
      );

      await client.query(
        `UPDATE delivery_lines SET gkm_status = $1 WHERE line_id = $2`,
        [gkmStatus, request.deliveryLineId]
      );

      // 6. Record audit event
      await client.query(
        `INSERT INTO audit_events (
          dc_id, event_type, user_id, device_id, occurred_at,
          reference_doc, previous_state, new_state, reason_code
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)`,
        [
          request.dcId,
          'MRP_CHANGE_APPROVED',
          request.userId,
          request.deviceId,
          request.deliveryLineId,
          JSON.stringify({ sku_id: request.skuId, old_mrp: 'unknown' }), // Simplified for now
          JSON.stringify({ 
            new_mrp: request.newMRP, 
            invoice_unit_price: request.invoiceUnitPrice,
            variance_pct: variancePct,
            tier: tier
          }),
          request.reasonCode
        ]
      );

      await client.query('COMMIT');

      const check = checkResult.rows[0];
      return {
        checkId: check.check_id,
        deliveryLineId: check.delivery_line_id,
        poUnitPrice: parseFloat(check.po_unit_price),
        invoiceUnitPrice: parseFloat(check.invoice_unit_price),
        variancePct: parseFloat(check.variance_pct),
        tier: check.tier,
        checkedAt: check.checked_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Publish alert to SQS (simplified for now)
   */
  private async publishAlert(client: any, alert: {
    dcId: string;
    alertType: string;
    severity: string;
    referenceDoc: string;
    payload: any;
  }): Promise<void> {
    await client.query(
      `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, triggered_at, payload)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [alert.dcId, alert.alertType, alert.severity, alert.referenceDoc, JSON.stringify(alert.payload)]
    );
  }
}
