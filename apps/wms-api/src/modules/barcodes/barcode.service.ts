import type { Pool } from 'pg';
import type { BarcodeType } from '@sumosave/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarcodeRow {
  barcode: string;
  sku_id: string;
  barcode_type: BarcodeType;
  is_primary: boolean;
  created_at: string;
}

export interface SKUDetails {
  sku_id: string;
  dc_id: string;
  sku_code: string;
  name: string;
  status: string;
}

export interface BarcodeConflictError extends Error {
  code: 'BARCODE_CONFLICT';
  conflicting_sku: SKUDetails;
}

export interface BarcodeNotFoundError extends Error {
  code: 'BARCODE_NOT_FOUND';
}

// ─── BarcodeService ───────────────────────────────────────────────────────────

export class BarcodeService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
  ) {}

  /**
   * Registers a barcode → SKU mapping.
   * BR-03: One barcode maps to exactly one SKU (injective).
   * - If the barcode already maps to the SAME SKU, the call is idempotent (no-op).
   * - If the barcode already maps to a DIFFERENT SKU, throws BARCODE_CONFLICT.
   */
  async registerBarcode(
    barcode: string,
    skuId: string,
    barcodeType: BarcodeType,
    isPrimary: boolean,
  ): Promise<BarcodeRow> {
    // Application-layer injectivity check
    const existing = await this.dbRead.query<BarcodeRow & { sku_id: string }>(
      `SELECT b.barcode, b.sku_id, b.barcode_type, b.is_primary, b.created_at
       FROM barcodes b
       WHERE b.barcode = $1 AND b.voided_at IS NULL`,
      [barcode],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0]!;

      // Idempotent: same barcode, same SKU — return existing row
      if (row.sku_id === skuId) {
        return row;
      }

      // Conflict: barcode already maps to a different SKU
      const skuResult = await this.dbRead.query<SKUDetails>(
        `SELECT sku_id, dc_id, sku_code, name, status FROM skus WHERE sku_id = $1`,
        [row.sku_id],
      );

      const conflictingSku = skuResult.rows[0] ?? {
        sku_id: row.sku_id,
        dc_id: '',
        sku_code: '',
        name: '',
        status: '',
      };

      const err = new Error(
        `BARCODE_CONFLICT: barcode "${barcode}" already mapped to SKU ${row.sku_id}`,
      ) as BarcodeConflictError;
      err.code = 'BARCODE_CONFLICT';
      err.conflicting_sku = conflictingSku;
      throw err;
    }

    // Insert new mapping
    const result = await this.db.query<BarcodeRow>(
      `INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [barcode, skuId, barcodeType, isPrimary],
    );

    return result.rows[0]!;
  }

  /**
   * Looks up the SKU details for a given barcode.
   * Throws BARCODE_NOT_FOUND if no mapping exists or if voided.
   */
  async lookupBarcode(barcode: string): Promise<SKUDetails & { barcode: string; barcode_type: BarcodeType; is_primary: boolean }> {
    const result = await this.dbRead.query<
      SKUDetails & { barcode: string; barcode_type: BarcodeType; is_primary: boolean }
    >(
      `SELECT s.sku_id, s.dc_id, s.sku_code, s.name, s.status,
              b.barcode, b.barcode_type, b.is_primary
       FROM barcodes b
       JOIN skus s ON s.sku_id = b.sku_id
       WHERE b.barcode = $1 AND b.voided_at IS NULL`,
      [barcode],
    );

    if (result.rows.length === 0) {
      const err = new Error(
        `BARCODE_NOT_FOUND: barcode "${barcode}" is not registered or has been voided`,
      ) as BarcodeNotFoundError;
      err.code = 'BARCODE_NOT_FOUND';
      throw err;
    }

    return result.rows[0]!;
  }

  /**
   * Voids a barcode to prevent further use.
   * Admin only.
   */
  async voidBarcode(barcode: string, userId: string, dcId: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE barcodes 
       SET voided_at = now(), voided_by = $1
       WHERE barcode = $2 AND voided_at IS NULL
       RETURNING *`,
      [userId, barcode]
    );

    if (result.rows.length === 0) {
      throw new Error('BARCODE_NOT_FOUND or already voided');
    }

    // Record audit event
    await this.db.query(
      `INSERT INTO audit_events (dc_id, event_type, user_id, reference_doc, reason_code)
       VALUES ($1, 'BARCODE_VOIDED', $2, $3, 'Administrative Void')`,
      [dcId, userId, barcode]
    );
  }

  /**
   * Reinstates a previously voided barcode.
   * Admin only.
   */
  async reinstateBarcode(barcode: string, userId: string, dcId: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE barcodes 
       SET voided_at = NULL, voided_by = NULL
       WHERE barcode = $1 AND voided_at IS NOT NULL
       RETURNING *`,
      [barcode]
    );

    if (result.rows.length === 0) {
      throw new Error('BARCODE_NOT_FOUND or not voided');
    }

    // Record audit event
    await this.db.query(
      `INSERT INTO audit_events (dc_id, event_type, user_id, reference_doc, reason_code)
       VALUES ($1, 'BARCODE_REINSTATED', $2, $3, 'Administrative Reinstate')`,
      [dcId, userId, barcode]
    );
  }
}
