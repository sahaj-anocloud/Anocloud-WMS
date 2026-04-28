import type { Pool } from 'pg';
import type { SKUCategory, SKUStatus } from '@sumosave/shared-types';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSKUInput {
  sku_code: string;
  name: string;
  category: SKUCategory;
  packaging_class: string;
  is_ft?: boolean;
  is_perishable?: boolean;
  requires_cold?: boolean;
  gst_rate: number;
  mrp: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  weight_g?: number;
  barcodes?: Array<{ barcode: string; barcode_type: string; is_primary?: boolean }>;
}

export interface UpdateSKUInput {
  name?: string;
  packaging_class?: string;
  is_ft?: boolean;
  is_perishable?: boolean;
  requires_cold?: boolean;
  gst_rate?: number;
  mrp?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  weight_g?: number;
  reason_code?: string;
}

export interface SKURow {
  sku_id: string;
  dc_id: string;
  sku_code: string;
  name: string;
  category: SKUCategory;
  packaging_class: string;
  is_ft: boolean;
  is_perishable: boolean;
  requires_cold: boolean;
  gst_rate: number;
  mrp: number;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_g: number | null;
  status: SKUStatus;
}

export interface BulkImportRow extends CreateSKUInput {
  [key: string]: unknown;
}

export interface BulkImportResult {
  imported: number;
  skus: SKURow[];
}

// ─── Categories that require volumetric data ──────────────────────────────────

const VOLUMETRIC_CATEGORIES: SKUCategory[] = ['FMCG_Food', 'BDF', 'Fresh', 'Chocolate'];

// ─── SKUCompletenessValidator ─────────────────────────────────────────────────

/**
 * Returns an array of missing mandatory attribute names.
 * An empty array means the SKU is complete for its category.
 */
export function SKUCompletenessValidator(
  category: SKUCategory,
  data: Partial<CreateSKUInput> & { barcodeCount?: number },
): string[] {
  const missing: string[] = [];

  // Universal mandatory attributes
  if (!data.sku_code) missing.push('sku_code');
  if (!data.name) missing.push('name');
  if (!data.category) missing.push('category');
  if (!data.packaging_class) missing.push('packaging_class');
  if (data.gst_rate === undefined || data.gst_rate === null) missing.push('gst_rate');
  if (data.mrp === undefined || data.mrp === null) missing.push('mrp');

  // At least one barcode required
  const barcodeCount = data.barcodeCount ?? (data.barcodes?.length ?? 0);
  if (barcodeCount === 0) missing.push('barcode');

  // Volumetric attributes for specific categories
  if (VOLUMETRIC_CATEGORIES.includes(category)) {
    if (data.length_mm === undefined || data.length_mm === null) missing.push('length_mm');
    if (data.width_mm === undefined || data.width_mm === null) missing.push('width_mm');
    if (data.height_mm === undefined || data.height_mm === null) missing.push('height_mm');
    if (data.weight_g === undefined || data.weight_g === null) missing.push('weight_g');
  }

  return missing;
}

// ─── SKUService ───────────────────────────────────────────────────────────────

export class SKUService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
  ) {}

  async createSKU(dcId: string, data: CreateSKUInput): Promise<SKURow> {
    const missingAttrs = SKUCompletenessValidator(data.category, data);
    const status: SKUStatus = missingAttrs.length === 0 ? 'Active' : 'Incomplete';

    const result = await this.db.query<SKURow>(
      `INSERT INTO skus
         (dc_id, sku_code, name, category, packaging_class,
          is_ft, is_perishable, requires_cold,
          gst_rate, mrp, length_mm, width_mm, height_mm, weight_g, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        dcId,
        data.sku_code,
        data.name,
        data.category,
        data.packaging_class,
        data.is_ft ?? false,
        data.is_perishable ?? false,
        data.requires_cold ?? false,
        data.gst_rate,
        data.mrp,
        data.length_mm ?? null,
        data.width_mm ?? null,
        data.height_mm ?? null,
        data.weight_g ?? null,
        status,
      ],
    );

    const sku = result.rows[0]!;

    // Insert barcodes if provided
    if (data.barcodes && data.barcodes.length > 0) {
      for (const b of data.barcodes) {
        await this.db.query(
          `INSERT INTO barcodes (barcode, sku_id, barcode_type, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [b.barcode, sku.sku_id, b.barcode_type, b.is_primary ?? false],
        );
      }
    }

    return sku;
  }

  async updateSKU(
    skuId: string,
    data: UpdateSKUInput,
    userId: string,
    deviceId: string,
    dcId: string,
  ): Promise<SKURow> {
    // Fetch current state for audit
    const currentResult = await this.dbRead.query<SKURow>(
      `SELECT * FROM skus WHERE sku_id = $1`,
      [skuId],
    );

    if (currentResult.rows.length === 0) {
      throw new Error(`SKU_NOT_FOUND: ${skuId}`);
    }

    const previous = currentResult.rows[0]!;

    // Build dynamic SET clause
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatable: (keyof UpdateSKUInput)[] = [
      'name', 'packaging_class', 'is_ft', 'is_perishable',
      'requires_cold', 'gst_rate', 'mrp',
      'length_mm', 'width_mm', 'height_mm', 'weight_g',
    ];

    for (const key of updatable) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return previous;
    }

    values.push(skuId);
    const updateResult = await this.db.query<SKURow>(
      `UPDATE skus SET ${fields.join(', ')} WHERE sku_id = $${idx} RETURNING *`,
      values,
    );

    const updated = updateResult.rows[0]!;

    // Record audit event
    await writeAuditEvent(this.db, {
      dc_id: dcId,
      event_type: 'SKU_ATTRIBUTE_UPDATED',
      user_id: userId,
      device_id: deviceId,
      reference_doc: skuId,
      previous_state: previous as unknown as Record<string, unknown>,
      new_state: updated as unknown as Record<string, unknown>,
      ...(data.reason_code && { reason_code: data.reason_code }),
    });

    return updated;
  }

  async bulkImportSKUs(dcId: string, rows: BulkImportRow[]): Promise<BulkImportResult> {
    // Validate all rows first — all-or-nothing
    const errors: Array<{ row: number; missing: string[] }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const missing = SKUCompletenessValidator(row.category, row);
      if (missing.length > 0) {
        errors.push({ row: i + 1, missing });
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `BULK_IMPORT_VALIDATION_FAILED: ${JSON.stringify(errors)}`,
      );
    }

    // All rows valid — insert all
    const inserted: SKURow[] = [];

    for (const row of rows) {
      const sku = await this.createSKU(dcId, row);
      inserted.push(sku);
    }

    return { imported: inserted.length, skus: inserted };
  }

  /**
   * Enforces BR-02: SKU in Incomplete status blocks all inbound receipt transactions.
   * Call this before any receipt operation.
   */
  async assertSKUReceivable(skuId: string): Promise<void> {
    const result = await this.dbRead.query<{ status: SKUStatus }>(
      `SELECT status FROM skus WHERE sku_id = $1`,
      [skuId],
    );

    if (result.rows.length === 0) {
      throw new Error(`SKU_NOT_FOUND: ${skuId}`);
    }

    if (result.rows[0]!.status === 'Incomplete') {
      throw new Error('RECEIPT_BLOCKED_INCOMPLETE_SKU');
    }
  }

  async listSKUs(dcId: string, options: { search?: string; category?: SKUCategory; limit?: number; offset?: number } = {}): Promise<{ data: SKURow[]; total: number }> {
    const { search, category, limit = 50, offset = 0 } = options;
    const params: unknown[] = [dcId];
    const clauses: string[] = ['dc_id = $1'];
    let idx = 2;

    if (search) {
      clauses.push(`(sku_code ILIKE $${idx} OR name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (category) {
      clauses.push(`category = $${idx}`);
      params.push(category);
      idx++;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const countResult = await this.dbRead.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM skus ${where}`,
      params,
    );

    const dataParams = [...params, limit, offset];
    const result = await this.dbRead.query<SKURow>(
      `SELECT * FROM skus ${where} ORDER BY sku_code LIMIT $${idx} OFFSET $${idx + 1}`,
      dataParams,
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0]?.total ?? '0', 10),
    };
  }
}

