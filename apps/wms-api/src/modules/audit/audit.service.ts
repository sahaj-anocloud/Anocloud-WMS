import { Pool } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEventFilter {
  dcId: string;
  fromDate?: string;
  toDate?: string;
  eventType?: string;
  userId?: string;
  referenceDoc?: string;
  limit?: number;
}

export interface AuditEventRow {
  event_id: string;
  dc_id: string;
  event_type: string;
  user_id: string;
  device_id: string;
  occurred_at: string;
  reference_doc?: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  reason_code?: string;
}

export interface ChainOfCustodyResult {
  lpn_barcode: string;
  events: AuditEventRow[];
  is_complete: boolean;
  missing_steps: string[];
}

// Required chain of events for a complete LPN custody trail
const REQUIRED_CHAIN = [
  'GATE_ENTRY',
  'DOCK_ASSIGNED',
  'UNLOADING_SCAN',
  'QC_SCAN',
  'GKM_CHECK',
  'GST_CHECK',
  'AUTO_GRN_INITIATED',
  'GRPO_CONFIRMED',
] as const;

// ─── Audit Service ────────────────────────────────────────────────────────────

export class AuditService {
  constructor(private readonly db: Pool) {}

  /**
   * Returns all audit events for an LPN barcode, ordered by occurred_at.
   * Validates completeness of required chain.
   * Req 16.3, 16.4
   */
  async getChainOfCustody(lpnBarcode: string, dcId: string): Promise<ChainOfCustodyResult> {
    const result = await this.db.query<AuditEventRow>(
      `SELECT event_id, dc_id, event_type, user_id, device_id,
              occurred_at::text AS occurred_at, reference_doc,
              previous_state, new_state, reason_code
       FROM audit_events
       WHERE reference_doc = $1 AND dc_id = $2
       ORDER BY occurred_at ASC`,
      [lpnBarcode, dcId],
    );

    const events = result.rows;
    const presentTypes = new Set(events.map((e) => e.event_type));

    const missingSteps = REQUIRED_CHAIN.filter(
      (step) =>
        step === 'QC_SCAN'
          ? !events.some((e) => e.event_type.startsWith('QC_SCAN'))
          : !presentTypes.has(step),
    );

    return {
      lpn_barcode: lpnBarcode,
      events,
      is_complete: missingSteps.length === 0,
      missing_steps: missingSteps,
    };
  }

  /**
   * Filtered audit log query. Req 16.4
   */
  async queryEvents(filters: AuditEventFilter): Promise<AuditEventRow[]> {
    const conditions = ['dc_id = $1'];
    const params: unknown[] = [filters.dcId];
    let idx = 2;

    if (filters.fromDate) {
      conditions.push(`occurred_at >= $${idx++}`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`occurred_at <= $${idx++}`);
      params.push(filters.toDate);
    }
    if (filters.eventType) {
      conditions.push(`event_type = $${idx++}`);
      params.push(filters.eventType);
    }
    if (filters.userId) {
      conditions.push(`user_id = $${idx++}`);
      params.push(filters.userId);
    }
    if (filters.referenceDoc) {
      conditions.push(`reference_doc = $${idx++}`);
      params.push(filters.referenceDoc);
    }

    const limit = filters.limit ?? 500;

    const result = await this.db.query<AuditEventRow>(
      `SELECT event_id, dc_id, event_type, user_id, device_id,
              occurred_at::text AS occurred_at, reference_doc,
              previous_state, new_state, reason_code
       FROM audit_events
       WHERE ${conditions.join(' AND ')}
       ORDER BY occurred_at DESC
       LIMIT $${idx}`,
      [...params, limit],
    );

    return result.rows;
  }

  /**
   * Exports audit events to JSON string.
   * The round-trip property asserts that parse(serialize(events)) == events.
   * Req 16.7
   */
  serializeEvents(events: AuditEventRow[]): string {
    return JSON.stringify(events, null, 2);
  }

  /**
   * Parses a JSON export back to AuditEventRow[].
   */
  parseEvents(json: string): AuditEventRow[] {
    return JSON.parse(json) as AuditEventRow[];
  }

  /**
   * Returns the current count of audit events for a reference document.
   * Used by Property 25 (immutability) to assert monotonic non-decrease.
   */
  async countEvents(referenceDoc: string, dcId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM audit_events WHERE reference_doc = $1 AND dc_id = $2`,
      [referenceDoc, dcId],
    );
    return parseInt(result.rows[0]!.count, 10);
  }

  /**
   * Enqueues a CSV/JSON export of audit events to S3. Req 16.7
   */
  async enqueueExport(
    dcId: string,
    filters: Omit<AuditEventFilter, 'dcId'>,
    format: 'CSV' | 'JSON',
    requestedBy: string,
  ): Promise<{ job_id: string; status: 'queued'; estimated_s3_url: string }> {
    const jobId = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, new_state)
       VALUES ($1,'AUDIT_EXPORT_QUEUED',$2,'system',$3)`,
      [dcId, requestedBy, JSON.stringify({ job_id: jobId, format, filters })],
    );

    return {
      job_id: jobId,
      status: 'queued',
      estimated_s3_url: `https://wms-audit.s3.amazonaws.com/exports/${jobId}.${format.toLowerCase()}`,
    };
  }
}
