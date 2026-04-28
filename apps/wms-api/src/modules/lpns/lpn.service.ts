import net from 'net';
import { Pool, PoolClient } from 'pg';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateLPNInput {
  dcCode: string;
  skuId: string;
  batchNumber?: string | undefined;
  expiryDate?: string | undefined; // YYYY-MM-DD
  location?: string | undefined;
  deliveryLineId?: string | undefined;
  userId: string;
  deviceId: string;
  dcId: string;
  printerHost?: string | undefined;
}

export interface LPNRow {
  lpn_id: string;
  dc_id: string;
  lpn_barcode: string;
  sku_id: string;
  delivery_line_id?: string;
  batch_number?: string;
  expiry_date?: string;
  location?: string;
  status: string;
  printed_by: string;
  printed_at: string;
  is_reprinted: boolean;
}

export interface LPNDecoded {
  lpn_barcode: string;
  dc_code: string;
  date_part: string;
  sequence: string;
  sku_id: string;
  batch_number?: string;
  expiry_date?: string;
  location?: string;
}

export interface GS1128Fields {
  sscc?: string;      // AI 00 — SSCC-18
  gtin?: string;      // AI 01 — GTIN-14
  batch?: string;     // AI 10 — Batch/Lot
  expiry?: string;    // AI 17 — Expiry YYMMDD
}

export interface RelabelInput {
  dcId: string;
  dcCode: string;
  originalBarcode: string;
  skuId: string;
  reason: string;
  userId: string;
  deviceId: string;
  batchNumber?: string | undefined;
  expiryDate?: string | undefined;
  location?: string | undefined;
  deliveryLineId?: string | undefined;
  printerHost?: string | undefined;
}

export interface ReprintInput {
  lpnId: string;
  dcId: string;
  userId: string;
  deviceId: string;
  reasonCode: string;
  printerHost?: string | undefined;
  sessionId: string;
  supervisorToken?: string | undefined;
}

// ─── GS1-128 Encoding ─────────────────────────────────────────────────────────

/**
 * Encodes LPN fields into a GS1-128 string.
 * @param fields The fields to encode.
 * @param forHumanReadable If true, includes parentheses (e.g., "(01)123"). 
 *                         If false, returns raw data for barcode encoding.
 */
export function encodeGS1128(fields: GS1128Fields, forHumanReadable = true): string {
  const parts: string[] = [];
  const open = forHumanReadable ? '(' : '';
  const close = forHumanReadable ? ')' : '';

  if (fields.sscc) {
    const sscc = fields.sscc.padStart(18, '0').slice(0, 18);
    parts.push(`${open}00${close}${sscc}`);
  }

  if (fields.gtin) {
    const gtin = fields.gtin.padStart(14, '0').slice(0, 14);
    parts.push(`${open}01${close}${gtin}`);
  }

  if (fields.expiry) {
    parts.push(`${open}17${close}${fields.expiry}`);
  }

  if (fields.batch) {
    parts.push(`${open}10${close}${fields.batch}`);
  }

  return parts.join('');
}

/**
 * Decodes a GS1-128 encoded string back into fields.
 * Supports AIs: (00), (01), (10), (17).
 */
export function decodeGS1128(encoded: string): GS1128Fields {
  const result: GS1128Fields = {};
  let remaining = encoded;

  while (remaining.length > 0) {
    const aiMatch = remaining.match(/^\((\d{2})\)(.*)/);
    if (!aiMatch) break;

    const ai = aiMatch[1]!;
    const rest = aiMatch[2]!;

    switch (ai) {
      case '00': {
        // SSCC-18: fixed 18 digits
        result.sscc = rest.slice(0, 18);
        remaining = rest.slice(18);
        break;
      }
      case '01': {
        // GTIN-14: fixed 14 digits
        result.gtin = rest.slice(0, 14);
        remaining = rest.slice(14);
        break;
      }
      case '17': {
        // Expiry: fixed 6 digits YYMMDD
        result.expiry = rest.slice(0, 6);
        remaining = rest.slice(6);
        break;
      }
      case '10': {
        // Batch/Lot: variable-length — read until next '(' or end
        const nextAI = rest.indexOf('(');
        if (nextAI === -1) {
          result.batch = rest;
          remaining = '';
        } else {
          result.batch = rest.slice(0, nextAI);
          remaining = rest.slice(nextAI);
        }
        break;
      }
      default: {
        // Skip unknown AI
        remaining = rest.slice(2);
        break;
      }
    }
  }

  return result;
}

/**
 * Converts a YYYY-MM-DD expiry date to the GS1-128 YYMMDD format (AI 17).
 */
export function toGS1ExpiryDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${year!.slice(2)}${month}${day}`;
}

/**
 * Converts a GS1-128 YYMMDD date back to ISO YYYY-MM-DD.
 * Assumes 20xx century.
 */
export function fromGS1ExpiryDate(yymmdd: string): string {
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  return `20${yy}-${mm}-${dd}`;
}

// ─── LPN Format ───────────────────────────────────────────────────────────────

/**
 * Formats a sequence number as a zero-padded 8-digit string.
 */
export function formatSequence(seq: number): string {
  return String(seq).padStart(8, '0');
}

/**
 * Builds the LPN barcode string.
 * Format: {DC_CODE}-{YYYYMMDD}-{8-digit-sequence}
 */
export function buildLPNBarcode(dcCode: string, datePart: string, seq: number): string {
  return `${dcCode}-${datePart}-${formatSequence(seq)}`;
}

/**
 * Returns today's date formatted as YYYYMMDD.
 */
export function todayYYYYMMDD(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// ─── ZPL / TCP Printing ───────────────────────────────────────────────────────

const ZPL_PRINT_TIMEOUT_MS = 3000;
const ZPL_PRINT_PORT = 9100;
const ZPL_RETRY_COUNT = 1;

/**
 * Builds a ZPL label template for an LPN.
 */
export function buildZPLTemplate(params: {
  lpnBarcode: string;
  gs1Encoded: string;
  skuName: string;
  batchNumber?: string | null | undefined;
  expiryDate?: string | null | undefined;
  dcCode: string;
  location?: string | null | undefined;
}): string {
  const lines: string[] = [
    '^XA',
    '^CI28',                         // UTF-8 character set
    '^FO50,30^A0N,30,30^FDSumoSave WMS^FS',
    `^FO50,70^A0N,25,25^FD${params.dcCode}^FS`,
    // GS1-128 barcode
    `^FO50,110^BY3^BCN,80,Y,N,N^FD>:${params.gs1Encoded}^FS`,
    // LPN human-readable
    `^FO50,210^A0N,22,22^FD${params.lpnBarcode}^FS`,
    // SKU name
    `^FO50,245^A0N,20,20^FD${params.skuName.slice(0, 40)}^FS`,
  ];

  if (params.batchNumber) {
    lines.push(`^FO50,275^A0N,18,18^FDBatch: ${params.batchNumber}^FS`);
  }

  if (params.expiryDate) {
    lines.push(`^FO50,300^A0N,18,18^FDExpiry: ${params.expiryDate}^FS`);
  }

  if (params.location) {
    lines.push(`^FO50,325^A0N,18,18^FDLocation: ${params.location}^FS`);
  }

  lines.push('^XZ');
  return lines.join('\n');
}

/**
 * Sends a ZPL document to a Zebra printer over raw TCP port 9100.
 * Enforces 3-second timeout and 1 retry.
 */
export async function sendZPLToPrinter(printerHost: string, zpl: string): Promise<void> {
  for (let attempt = 0; attempt <= ZPL_RETRY_COUNT; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        let settled = false;

        const settle = (fn: () => void) => {
          if (!settled) {
            settled = true;
            socket.destroy();
            fn();
          }
        };

        const timer = setTimeout(() => {
          settle(() => reject(new Error(`Printer timeout after ${ZPL_PRINT_TIMEOUT_MS}ms`)));
        }, ZPL_PRINT_TIMEOUT_MS);

        socket.on('error', (err) => {
          clearTimeout(timer);
          settle(() => reject(err));
        });

        socket.connect(ZPL_PRINT_PORT, printerHost, () => {
          socket.write(zpl, 'utf8', (err) => {
            clearTimeout(timer);
            if (err) {
              settle(() => reject(err));
            } else {
              settle(() => resolve());
            }
          });
        });
      });

      return; // Success
    } catch (err) {
      if (attempt === ZPL_RETRY_COUNT) throw err;
      // Wait 500ms before retry
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// ─── LPN Service ──────────────────────────────────────────────────────────────

const reprintCounts = new Map<string, number>();

export class LPNService {
  constructor(
    private readonly db: Pool,
    private readonly redis?: any // Redis instance from fastify.redis
  ) {}

  /**
   * Generates a unique LPN barcode using the per-DC DB sequence.
   * Writes an `lpns` record, sends a ZPL print job, and records
   * the print event in `audit_events`.
   *
   * Req 13.1–13.5, 13.8
   */
  async generateLPN(input: GenerateLPNInput): Promise<LPNRow> {
    const client: PoolClient = await this.db.connect();

    try {
      await client.query('BEGIN');

      // 1. Advance per-DC sequence
      const seqName = `lpn_seq_${input.dcCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const seqResult = await client.query<{ nextval: string }>(
        `SELECT nextval($1::regclass) AS nextval`,
        [seqName],
      );
      const seq = parseInt(seqResult.rows[0]!.nextval, 10);

      const datePart = todayYYYYMMDD();
      const lpnBarcode = buildLPNBarcode(input.dcCode, datePart, seq);

      // 2. Build GS1-128 encoded string
      const gs1Fields: GS1128Fields = {
        gtin: input.skuId.replace(/-/g, '').slice(0, 14).padStart(14, '0'),
      };
      if (input.expiryDate) {
        gs1Fields.expiry = toGS1ExpiryDate(input.expiryDate);
      }
      if (input.batchNumber) {
        gs1Fields.batch = input.batchNumber;
      }
      const gs1Encoded = encodeGS1128(gs1Fields);

      // 3. Insert lpns record
      const insertResult = await client.query<LPNRow>(
        `INSERT INTO lpns
           (dc_id, lpn_barcode, sku_id, delivery_line_id, batch_number,
            expiry_date, location, status, printed_by, printed_at, is_reprinted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Active',$8,now(),false)
         RETURNING *`,
        [
          input.dcId,
          lpnBarcode,
          input.skuId,
          input.deliveryLineId ?? null,
          input.batchNumber ?? null,
          input.expiryDate ?? null,
          input.location ?? null,
          input.userId,
        ],
      );

      const lpnRow = insertResult.rows[0]!;

      // 4. Write audit event
      await client.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, new_state)
         VALUES ($1,'LPN_GENERATED',$2,$3,$4,$5)`,
        [
          input.dcId,
          input.userId,
          input.deviceId,
          lpnBarcode,
          JSON.stringify({
            lpn_id: lpnRow.lpn_id,
            lpn_barcode: lpnBarcode,
            sku_id: input.skuId,
            batch_number: input.batchNumber,
            expiry_date: input.expiryDate,
            gs1_encoded: gs1Encoded,
          }),
        ],
      );

      await client.query('COMMIT');

      // 5. Send ZPL print job (outside transaction — best-effort)
      if (input.printerHost) {
        try {
          // Fetch SKU name for label
          const skuResult = await this.db.query<{ name: string }>(
            `SELECT name FROM skus WHERE sku_id = $1`,
            [input.skuId],
          );
          const skuName = skuResult.rows[0]?.name ?? input.skuId;

          const zpl = buildZPLTemplate({
            lpnBarcode,
            gs1Encoded: encodeGS1128(gs1Fields, false), // Raw data for barcode
            skuName,
            batchNumber: input.batchNumber,
            expiryDate: input.expiryDate,
            dcCode: input.dcCode,
            location: input.location,
          });

          await this.printWithFailover(input.dcId, lpnBarcode, zpl, input.printerHost);
        } catch (printErr) {
          // Log but do not fail the LPN generation
          console.error('LPN print failed:', printErr);
        }
      }

      return lpnRow;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Decodes an LPN barcode and returns the associated record.
   * Req 13.4
   */
  async getLPN(lpnBarcode: string): Promise<LPNRow & LPNDecoded> {
    const result = await this.db.query<LPNRow>(
      `SELECT * FROM lpns WHERE lpn_barcode = $1`,
      [lpnBarcode],
    );

    if (result.rows.length === 0) {
      const err = new Error(`LPN_NOT_FOUND: ${lpnBarcode}`) as Error & { code: string };
      err.code = 'LPN_NOT_FOUND';
      throw err;
    }

    const row = result.rows[0]!;

    // Parse LPN barcode format: {DC_CODE}-{YYYYMMDD}-{8-digit-seq}
    const parts = lpnBarcode.split('-');
    // DC code may itself contain hyphens — last two segments are date and seq
    const dcCode = parts.slice(0, -2).join('-');
    const datePart = parts[parts.length - 2] ?? '';
    const sequence = parts[parts.length - 1] ?? '';

    return {
      ...row,
      lpn_barcode: lpnBarcode,
      dc_code: dcCode,
      date_part: datePart,
      sequence,
    };
  }

  /**
   * Initiates relabeling when a scanned barcode does not resolve to an Active SKU.
   * Records original barcode, new LPN, reason, and user in audit_events.
   * Req 13.2, 13.6
   */
  async relabel(input: RelabelInput): Promise<LPNRow> {
    const client: PoolClient = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Generate a new LPN
      const seqName = `lpn_seq_${input.dcCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const seqResult = await client.query<{ nextval: string }>(
        `SELECT nextval($1::regclass) AS nextval`,
        [seqName],
      );
      const seq = parseInt(seqResult.rows[0]!.nextval, 10);
      const datePart = todayYYYYMMDD();
      const lpnBarcode = buildLPNBarcode(input.dcCode, datePart, seq);

      // Insert into lpns
      const insertResult = await client.query<LPNRow>(
        `INSERT INTO lpns
           (dc_id, lpn_barcode, sku_id, delivery_line_id, batch_number,
            expiry_date, location, status, printed_by, printed_at, is_reprinted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Active',$8,now(),false)
         RETURNING *`,
        [
          input.dcId,
          lpnBarcode,
          input.skuId,
          input.deliveryLineId ?? null,
          input.batchNumber ?? null,
          input.expiryDate ?? null,
          input.location ?? null,
          input.userId,
        ],
      );

      const lpnRow = insertResult.rows[0]!;

      // Record in relabel_events
      await client.query(
        `INSERT INTO relabel_events
           (dc_id, original_barcode, new_lpn_id, reason, performed_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [input.dcId, input.originalBarcode, lpnRow.lpn_id, input.reason, input.userId],
      );

      // Write audit event
      await client.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, previous_state, new_state, reason_code)
         VALUES ($1,'LPN_RELABELED',$2,$3,$4,$5,$6,$7)`,
        [
          input.dcId,
          input.userId,
          input.deviceId,
          lpnBarcode,
          JSON.stringify({ original_barcode: input.originalBarcode }),
          JSON.stringify({ lpn_id: lpnRow.lpn_id, lpn_barcode: lpnBarcode, sku_id: input.skuId }),
          input.reason,
        ],
      );

      await client.query('COMMIT');
      return lpnRow;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reprints an LPN label.
   * Flags `is_reprinted = true` and writes reprint audit event.
   * Req 13.7
   */
  async reprint(input: ReprintInput): Promise<LPNRow> {
    // 1. Session Reprint Limit Check (In-Memory Map)
    const mapKey = `${input.userId}:${input.lpnId}`;
    let reprintCount = reprintCounts.get(mapKey) ?? 0;

    // Block if count exceeds 3 and no supervisor token provided
    if (reprintCount >= 3 && !input.supervisorToken) {
      const err = new Error(`REPRINT_LIMIT_EXCEEDED: Maximum 3 reprints per session. Supervisor approval required.`) as Error & { code: string; currentCount: number };
      err.code = 'REPRINT_LIMIT_EXCEEDED';
      err.currentCount = reprintCount;
      throw err;
    }

    const client: PoolClient = await this.db.connect();

    try {
      await client.query('BEGIN');

      const fetchResult = await client.query<LPNRow>(
        `SELECT * FROM lpns WHERE lpn_id = $1 AND dc_id = $2 FOR UPDATE`,
        [input.lpnId, input.dcId],
      );

      if (fetchResult.rows.length === 0) {
        throw Object.assign(new Error(`LPN_NOT_FOUND: ${input.lpnId}`), { code: 'LPN_NOT_FOUND' });
      }

      const prev = fetchResult.rows[0]!;

      await client.query(
        `UPDATE lpns SET is_reprinted = true, status = 'Reprinted' WHERE lpn_id = $1`,
        [input.lpnId],
      );

      await client.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, previous_state, new_state, reason_code)
         VALUES ($1,'LPN_REPRINTED',$2,$3,$4,$5,$6,$7)`,
        [
          input.dcId,
          input.userId,
          input.deviceId,
          prev.lpn_barcode,
          JSON.stringify({ is_reprinted: prev.is_reprinted, status: prev.status }),
          JSON.stringify({ is_reprinted: true, status: 'Reprinted' }),
          input.reasonCode,
        ],
      );

      await client.query('COMMIT');

      // Increment reprint count in Map
      reprintCounts.set(mapKey, reprintCount + 1);

      return { ...prev, is_reprinted: true, status: 'Reprinted' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Returns the barcode remediation rate for a DC: relabeled / total received.
   * Used by KPI worker.
   */
  async getRemediationRate(dcId: string): Promise<number> {
    const result = await this.db.query<{ relabeled: string; total: string }>(
      `SELECT
         (SELECT COUNT(*) FROM relabel_events WHERE dc_id = $1) AS relabeled,
         (SELECT COUNT(*) FROM lpns WHERE dc_id = $1) AS total`,
      [dcId],
    );
    const { relabeled, total } = result.rows[0]!;
    const t = parseInt(total, 10);
    if (t === 0) return 0;
    return Math.min(100, (parseInt(relabeled, 10) / t) * 100);
  }

  /**
   * Sends a ZPL document with automatic failover to the next available printer in the cluster. Item #241.
   */
  async printWithFailover(dcId: string, lpnBarcode: string, zpl: string, initialHost?: string): Promise<void> {
    let currentHost = initialHost;
    let originalHost = initialHost;

    if (!currentHost) {
      const printerResult = await this.db.query<{ host: string }>(
        `SELECT host FROM printers WHERE dc_id = $1 AND status = 'Online' ORDER BY created_at LIMIT 1`,
        [dcId]
      );
      currentHost = printerResult.rows[0]?.host;
      originalHost = currentHost;
    }

    if (!currentHost) {
      throw new Error('NO_PRINTER_AVAILABLE');
    }

    try {
      await sendZPLToPrinter(currentHost, zpl);
      await this.logPrintEvent(dcId, lpnBarcode, originalHost, currentHost, 'Success');
    } catch (err) {
      console.error(`Printer ${currentHost} failed, attempting failover...`);
      
      const clusterResult = await this.db.query<{ dock_cluster: string }>(
        `SELECT dock_cluster FROM printers WHERE host = $1 AND dc_id = $2`,
        [currentHost, dcId]
      );
      
      if (clusterResult.rows.length > 0) {
        const cluster = clusterResult.rows[0]!.dock_cluster;
        const backupResult = await this.db.query<{ host: string }>(
          `SELECT host FROM printers WHERE dc_id = $1 AND dock_cluster = $2 AND host != $3 AND status = 'Online' LIMIT 1`,
          [dcId, cluster, currentHost]
        );
        
        if (backupResult.rows.length > 0) {
          const backupHost = backupResult.rows[0]!.host;
          try {
            await sendZPLToPrinter(backupHost, zpl);
            await this.logPrintEvent(dcId, lpnBarcode, originalHost, backupHost, 'Success', 'PRINTER_FAILOVER');
            return;
          } catch (backupErr) {
            console.error(`Backup printer ${backupHost} also failed.`);
          }
        }
      }

      await this.logPrintEvent(dcId, lpnBarcode, originalHost, currentHost, 'Failed');
      throw new Error('ALL_PRINTERS_FAILED');
    }
  }

  private async logPrintEvent(dcId: string, lpnBarcode: string, originalHost: string | undefined, actualHost: string, status: string, reason?: string): Promise<void> {
    await this.db.query(
      `INSERT INTO barcode_print_events (dc_id, lpn_barcode, original_host, actual_host, status, reason_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [dcId, lpnBarcode, originalHost, actualHost, status, reason]
    );
  }
}
