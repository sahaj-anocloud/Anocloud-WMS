import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export interface AuditEventInput {
  dc_id: string;
  event_type: string;
  user_id: string;
  device_id: string;
  reference_doc?: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  reason_code?: string;
}

export async function writeAuditEvent(db: Pool, event: AuditEventInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_events
       (dc_id, event_type, user_id, device_id, reference_doc, previous_state, new_state, reason_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.dc_id,
      event.event_type,
      event.user_id,
      event.device_id,
      event.reference_doc ?? null,
      event.previous_state ? JSON.stringify(event.previous_state) : null,
      event.new_state ? JSON.stringify(event.new_state) : null,
      event.reason_code ?? null,
    ],
  );
}

export default fp(async function auditPlugin(_fastify: FastifyInstance) {
  // writeAuditEvent is exported as a standalone function; no decoration needed.
});
