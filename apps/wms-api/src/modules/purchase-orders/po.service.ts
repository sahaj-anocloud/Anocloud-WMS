import type { Pool } from 'pg';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type POStatus = 'Open' | 'InProgress' | 'Closed' | 'PartiallyClosed';
export type POLineStatus = 'Open' | 'Blocked' | 'Closed';

export interface SAPPOLine {
  sap_line_number?: string;
  sku_id: string;
  ordered_qty: number;
  unit_price: number;
  gst_rate: number;
}

export interface SAPPOPayload {
  sap_po_number: string;
  dc_id: string;
  vendor_id: string;
  lines: SAPPOLine[];
}

export interface PORow {
  po_id: string;
  dc_id: string;
  sap_po_number: string;
  vendor_id: string;
  status: POStatus;
  created_at: string;
  sap_synced_at: string | null;
}

export interface POLineRow {
  po_line_id: string;
  po_id: string;
  sku_id: string;
  ordered_qty: number;
  unit_price: number;
  gst_rate: number;
  received_qty: number;
  status: POLineStatus;
}

export interface POWithLines extends PORow {
  lines: POLineRow[];
}

export interface SyncResult {
  po_id: string;
  sap_po_number: string;
  created: boolean;
  blocked_lines: string[];
}

// ─── POService ────────────────────────────────────────────────────────────────

export class POService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
  ) {}

  /**
   * Upserts a PO and its lines from a SAP IDoc/RFC payload.
   * Idempotent by sap_po_number — duplicate calls are ignored.
   * Flags lines referencing non-Active SKUs as Blocked and alerts Admin_User/BnM_User.
   * SAP PO is authoritative: no WMS user may override quantities or prices.
   */
  async syncFromSAP(payload: SAPPOPayload): Promise<SyncResult> {
    // Check for existing PO (idempotency)
    const existing = await this.dbRead.query<PORow>(
      `SELECT * FROM purchase_orders WHERE sap_po_number = $1`,
      [payload.sap_po_number],
    );

    let po: PORow;
    let created = false;

    if (existing.rows.length > 0) {
      // Duplicate — return existing without modification
      po = existing.rows[0]!;
    } else {
      // Insert new PO
      const insertResult = await this.db.query<PORow>(
        `INSERT INTO purchase_orders (dc_id, sap_po_number, vendor_id, status, sap_synced_at)
         VALUES ($1, $2, $3, 'Open', now())
         RETURNING *`,
        [payload.dc_id, payload.sap_po_number, payload.vendor_id],
      );
      po = insertResult.rows[0]!;
      created = true;
    }

    // Insert lines only for new POs
    const blockedLines: string[] = [];

    if (created) {
      for (const line of payload.lines) {
        // Check SKU status
        const skuResult = await this.dbRead.query<{ status: string }>(
          `SELECT status FROM skus WHERE sku_id = $1`,
          [line.sku_id],
        );

        const skuStatus = skuResult.rows[0]?.status;
        const lineStatus: POLineStatus = skuStatus === 'Active' ? 'Open' : 'Blocked';

        await this.db.query(
          `INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_price, gst_rate, received_qty, status)
           VALUES ($1, $2, $3, $4, $5, 0, $6)`,
          [po.po_id, line.sku_id, line.ordered_qty, line.unit_price, line.gst_rate, lineStatus],
        );

        if (lineStatus === 'Blocked') {
          blockedLines.push(line.sku_id);
        }
      }

      // Write PO_SYNCED audit event
      await writeAuditEvent(this.db, {
        dc_id: payload.dc_id,
        event_type: 'PO_SYNCED',
        user_id: 'system',
        device_id: 'sap-integration',
        reference_doc: po.po_id,
        new_state: {
          sap_po_number: payload.sap_po_number,
          vendor_id: payload.vendor_id,
          line_count: payload.lines.length,
          blocked_lines: blockedLines,
        },
      });

      // Alert on blocked lines (non-Active SKUs)
      if (blockedLines.length > 0) {
        await this.db.query(
          `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, payload)
           VALUES ($1, 'PO_LINE_BLOCKED_INACTIVE_SKU', 'Warning', $2, $3)`,
          [
            payload.dc_id,
            po.po_id,
            JSON.stringify({
              sap_po_number: payload.sap_po_number,
              blocked_sku_ids: blockedLines,
              target_roles: ['Admin_User', 'BnM_User'],
            }),
          ],
        );
      }
    }

    return {
      po_id: po.po_id,
      sap_po_number: po.sap_po_number,
      created,
      blocked_lines: blockedLines,
    };
  }

  /**
   * Closes a PO line after receipt.
   * BR-13: short-delivered lines close cleanly without creating a backorder.
   * Received quantity must never exceed ordered quantity (Property 5).
   * Transitions PO to Closed or PartiallyClosed based on remaining open lines.
   */
  async closePOLine(poLineId: string, receivedQty: number): Promise<POLineRow> {
    // Fetch the line
    const lineResult = await this.dbRead.query<POLineRow>(
      `SELECT * FROM po_lines WHERE po_line_id = $1`,
      [poLineId],
    );

    if (lineResult.rows.length === 0) {
      throw new Error(`PO_LINE_NOT_FOUND: ${poLineId}`);
    }

    const line = lineResult.rows[0]!;

    // Property 5: received qty must never exceed ordered qty
    if (receivedQty > line.ordered_qty) {
      throw new Error(
        `RECEIVED_QTY_EXCEEDS_ORDERED: received=${receivedQty} ordered=${line.ordered_qty}`,
      );
    }

    // Close the line (BR-13: no backorder on short delivery)
    const updatedLineResult = await this.db.query<POLineRow>(
      `UPDATE po_lines
       SET received_qty = $1, status = 'Closed'
       WHERE po_line_id = $2
       RETURNING *`,
      [receivedQty, poLineId],
    );

    const updatedLine = updatedLineResult.rows[0]!;

    // Determine PO status based on remaining open/blocked lines
    const remainingResult = await this.dbRead.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM po_lines
       WHERE po_id = $1 AND status NOT IN ('Closed')`,
      [line.po_id],
    );

    const remainingOpen = parseInt(remainingResult.rows[0]!.count, 10);
    const newPOStatus: POStatus = remainingOpen === 0 ? 'Closed' : 'PartiallyClosed';

    await this.db.query(
      `UPDATE purchase_orders SET status = $1 WHERE po_id = $2`,
      [newPOStatus, line.po_id],
    );

    return updatedLine;
  }

  /**
   * Returns a PO with all its lines and current status.
   */
  async getPOStatus(poIdOrSapNum: string): Promise<POWithLines> {
    const poResult = await this.dbRead.query<PORow>(
      `SELECT * FROM purchase_orders 
       WHERE po_id::text = $1 OR sap_po_number = $1`,
      [poIdOrSapNum],
    );

    if (poResult.rows.length === 0) {
      throw new Error(`PO_NOT_FOUND: ${poIdOrSapNum}`);
    }

    const po = poResult.rows[0]!;

    const linesResult = await this.dbRead.query<any>(
      `SELECT 
         pl.*, 
         s.name as sku_name, 
         s.category, 
         s.is_perishable 
       FROM po_lines pl
       JOIN skus s ON pl.sku_id = s.sku_id
       WHERE pl.po_id = $1 
       ORDER BY pl.po_line_id`,
      [po.po_id],
    );

    return {
      ...po,
      lines: linesResult.rows,
    };
  }
}
