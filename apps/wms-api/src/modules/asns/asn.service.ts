import type { Pool } from 'pg';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ASNChannel = 'Portal' | 'Email' | 'Paper' | 'BuyerFallback';
export type ASNStatus = 'Submitted' | 'Active' | 'Cancelled' | 'Expired';

export interface ASNRow {
  asn_id: string;
  dc_id: string;
  vendor_id: string;
  po_id: string;
  channel: ASNChannel;
  confidence_score: number;
  status: ASNStatus;
  submitted_at: string;
  is_late: boolean;
}

export interface CreateASNPayload {
  dc_id: string;
  vendor_id: string;
  po_id: string;
  channel: ASNChannel;
  data_completeness: number; // 0.0 to 1.0
  slot_start?: string; // ISO timestamp of delivery slot
  vehicle_number?: string;
  driver_name?: string;
  handling_unit_count?: number;
  invoice_reference?: string;
  lines: Array<{ sku_id: string; quantity: number; batch_number?: string; expiry_date?: string }>;
}

export interface ASNConfidenceResult {
  asn_id: string;
  channel: ASNChannel;
  confidence_score: number;
  is_late: boolean;
}

// ─── Channel Ranges ───────────────────────────────────────────────────────────

const CHANNEL_RANGES: Record<ASNChannel, { min: number; max: number }> = {
  Portal: { min: 90, max: 100 },
  Email: { min: 70, max: 89 },
  Paper: { min: 40, max: 69 },
  BuyerFallback: { min: 10, max: 39 },
};

// ─── ASNService ───────────────────────────────────────────────────────────────

export class ASNService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
    private readonly alertService?: any, // Optional AlertService
  ) {}

  /**
   * Calculates ASN confidence score based on channel, data completeness, and timing.
   * Algorithm:
   * - Base score = channel.min + round(dataCompleteness * (channel.max - channel.min))
   * - Late penalty: -10 if submitted < 2 hours before slot
   * - Final score clamped to [0, 100]
   */
  calculateASNConfidenceScore(
    payload: CreateASNPayload,
    submittedAt: Date,
    slotStart?: Date,
  ): { score: number; isLate: boolean } {
    let score = 0;
    
    // Channel points
    switch (payload.channel) {
      case 'Portal': score += 40; break;
      case 'Email': score += 25; break;
      case 'Paper': score += 10; break;
      case 'BuyerFallback': score += 5; break;
    }

    // Field completeness
    if (payload.vehicle_number) score += 10;
    if (payload.driver_name) score += 5;
    if (payload.handling_unit_count && payload.handling_unit_count > 0) score += 10;
    if (payload.invoice_reference) score += 5;

    let allBatch = true;
    let allExpiry = true;
    if (!payload.lines || payload.lines.length === 0) {
      allBatch = false;
      allExpiry = false;
    } else {
      for (const line of payload.lines) {
        if (!line.batch_number) allBatch = false;
        if (!line.expiry_date) allExpiry = false;
      }
    }
    if (allBatch) score += 15;
    if (allExpiry) score += 15;

    // Timeliness
    let isLate = false;
    if (slotStart) {
      const hoursBeforeSlot = (slotStart.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);
      if (hoursBeforeSlot < 2) {
        score -= 20;
        isLate = true;
      } else if (hoursBeforeSlot <= 4) {
        score -= 10;
      }
    }

    // Clamp to [0, 100]
    score = Math.max(0, Math.min(100, score));

    return { score, isLate };
  }

  /**
   * Creates a new ASN submission.
   * Validates:
   * - PO exists and is Open
   * - All line-item SKUs are Active
   * Calculates confidence score based on channel, data completeness, and timing.
   */
  async createASN(payload: CreateASNPayload): Promise<ASNRow> {
    // Validate PO exists and is Open
    const poResult = await this.dbRead.query<{ po_id: string; status: string }>(
      `SELECT po_id, status FROM purchase_orders WHERE po_id = $1`,
      [payload.po_id],
    );

    if (poResult.rows.length === 0) {
      throw new Error(`PO_NOT_FOUND: ${payload.po_id}`);
    }

    const po = poResult.rows[0]!;
    if (po.status !== 'Open') {
      throw new Error(`PO_NOT_OPEN: PO ${payload.po_id} has status ${po.status}`);
    }

    // Validate all line-item SKUs are Active
    const skuResult = await this.dbRead.query<{ sku_id: string; status: string }>(
      `SELECT s.sku_id, s.status
       FROM po_lines pl
       JOIN skus s ON pl.sku_id = s.sku_id
       WHERE pl.po_id = $1`,
      [payload.po_id],
    );

    const inactiveSKUs = skuResult.rows.filter((row) => row.status !== 'Active');
    if (inactiveSKUs.length > 0) {
      const skuIds = inactiveSKUs.map((s) => s.sku_id).join(', ');
      throw new Error(`INACTIVE_SKUS: The following SKUs are not Active: ${skuIds}`);
    }

    // Calculate confidence score
    const submittedAt = new Date();
    const slotStart = payload.slot_start ? new Date(payload.slot_start) : undefined;
    const { score, isLate } = this.calculateASNConfidenceScore(
      payload,
      submittedAt,
      slotStart,
    );

    // Insert ASN
    const insertResult = await this.db.query<ASNRow>(
      `INSERT INTO asns (dc_id, vendor_id, po_id, channel, confidence_score, status, submitted_at, is_late, data_completeness, vehicle_number)
       VALUES ($1, $2, $3, $4, $5, 'Submitted', $6, $7, $8, $9)
       RETURNING *`,
      [payload.dc_id, payload.vendor_id, payload.po_id, payload.channel, score, submittedAt, isLate, payload.data_completeness, payload.vehicle_number || null],
    );

    const asn = insertResult.rows[0]!;

    // 4. Insert ASN lines and check over-delivery variance (Item #102)
    for (const line of payload.lines) {
      await this.db.query(
        `INSERT INTO asn_lines (asn_id, sku_id, quantity) VALUES ($1, $2, $3)`,
        [asn.asn_id, line.sku_id, line.quantity],
      );

      // Check against PO ordered quantity
      const poLineResult = await this.dbRead.query<{ ordered_qty: string }>(
        `SELECT ordered_qty FROM po_lines WHERE po_id = $1 AND sku_id = $2`,
        [payload.po_id, line.sku_id],
      );

      if (poLineResult.rows.length > 0) {
        const orderedQty = parseFloat(poLineResult.rows[0]!.ordered_qty);
        const variancePct = orderedQty > 0 ? ((line.quantity - orderedQty) / orderedQty) * 100 : 0;

        if (variancePct > 5 && this.alertService) {
          // Get vendor name for alert
          const vendorResult = await this.dbRead.query<{ name: string }>(
            `SELECT name FROM vendors WHERE vendor_id = $1`,
            [payload.vendor_id],
          );
          const vendorName = vendorResult.rows[0]?.name ?? 'Unknown Vendor';

          await this.alertService!.createAlert({
            dcId: payload.dc_id,
            alertType: 'ASN_OVER_DELIVERY',
            referenceDoc: asn.asn_id,
            payload: {
              vendor_name: vendorName,
              po_id: payload.po_id,
              expected_qty: orderedQty,
              asn_qty: line.quantity,
              variance_pct: variancePct,
            },
          });
        }
      }
    }

    // Write audit event
    await writeAuditEvent(this.db, {
      dc_id: payload.dc_id,
      event_type: 'ASN_SUBMITTED',
      user_id: payload.vendor_id,
      device_id: 'vendor-portal',
      reference_doc: asn.asn_id,
      new_state: {
        asn_id: asn.asn_id,
        po_id: payload.po_id,
        vendor_id: payload.vendor_id,
        channel: payload.channel,
        confidence_score: score,
        is_late: isLate,
      },
    });

    return asn;
  }

  /**
   * Retrieves ASN confidence score and channel label.
   */
  async getASNConfidence(asnId: string): Promise<ASNConfidenceResult> {
    const result = await this.dbRead.query<ASNRow>(
      `SELECT asn_id, channel, confidence_score, is_late FROM asns WHERE asn_id = $1`,
      [asnId],
    );

    if (result.rows.length === 0) {
      throw new Error(`ASN_NOT_FOUND: ${asnId}`);
    }

    const asn = result.rows[0]!;
    return {
      asn_id: asn.asn_id,
      channel: asn.channel,
      confidence_score: asn.confidence_score,
      is_late: asn.is_late,
    };
  }

  /**
   * Checks if an ASN exists for a given PO.
   * Used to enforce: no delivery appointment may be booked without a corresponding ASN on file.
   */
  async hasASNForPO(poId: string): Promise<boolean> {
    const result = await this.dbRead.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM asns WHERE po_id = $1 AND status IN ('Submitted', 'Active')`,
      [poId],
    );

    const count = parseInt(result.rows[0]!.count, 10);
    return count > 0;
  }
}
