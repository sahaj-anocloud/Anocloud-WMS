/**
 * Compliance Document Expiry Scheduler
 *
 * Standalone cron job script — run by Kubernetes CronJob at 06:00 daily:
 *   node dist/jobs/expiry-alerts.js
 *
 * Behaviour:
 *  1. Queries vendor_documents for docs expiring within 30 days (status = 'Active')
 *     → publishes VENDOR_DOC_EXPIRY_WARNING to SQS Alert-Events queue
 *  2. Queries vendor_documents for already-expired docs (status = 'Active')
 *     → transitions vendor to 'Suspended'
 *     → blocks all Open PO lines for that vendor (sets status = 'Blocked')
 *     → blocks new ASN submissions (sets asns status = 'Cancelled' for Submitted/Active)
 */

import { Pool } from 'pg';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpiringDocRow {
  doc_id: string;
  vendor_id: string;
  doc_type: string;
  expiry_date: string; // YYYY-MM-DD
  dc_id: string;
}

export interface JobSummary {
  warningsSent: number;
  vendorsSuspended: number;
}

// ─── Core logic (exported for testing) ───────────────────────────────────────

export async function runExpiryAlerts(
  db: Pool,
  sqsClient: SQSClient,
  sqsQueueUrl: string,
): Promise<JobSummary> {
  let warningsSent = 0;
  let vendorsSuspended = 0;

  // ── 1. Expiry warnings: docs expiring within the next 30 days ──────────────
  const warningResult = await db.query<ExpiringDocRow>(
    `SELECT vd.doc_id, vd.vendor_id, vd.doc_type, vd.expiry_date::text, v.dc_id
     FROM vendor_documents vd
     JOIN vendors v ON v.vendor_id = vd.vendor_id
     WHERE vd.status = 'Active'
       AND vd.expiry_date BETWEEN now()::date AND (now() + INTERVAL '30 days')::date`,
  );

  for (const doc of warningResult.rows) {
    const messageBody = JSON.stringify({
      alert_type: 'VENDOR_DOC_EXPIRY_WARNING',
      vendor_id: doc.vendor_id,
      doc_type: doc.doc_type,
      expiry_date: doc.expiry_date,
      dc_id: doc.dc_id,
    });

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: sqsQueueUrl,
        MessageBody: messageBody,
      }),
    );

    warningsSent++;
  }

  // ── 2. Expired docs: expiry_date < today ──────────────────────────────────
  const expiredResult = await db.query<ExpiringDocRow>(
    `SELECT vd.doc_id, vd.vendor_id, vd.doc_type, vd.expiry_date::text, v.dc_id
     FROM vendor_documents vd
     JOIN vendors v ON v.vendor_id = vd.vendor_id
     WHERE vd.status = 'Active'
       AND vd.expiry_date < now()::date`,
  );

  // Collect unique vendor IDs that have at least one expired doc
  const expiredVendorIds = [...new Set(expiredResult.rows.map((r) => r.vendor_id))];

  for (const vendorId of expiredVendorIds) {
    // a) Suspend the vendor
    await db.query(
      `UPDATE vendors
       SET compliance_status = 'Suspended', updated_at = now()
       WHERE vendor_id = $1
         AND compliance_status != 'Suspended'`,
      [vendorId],
    );

    // b) Block all Open PO lines for this vendor
    await db.query(
      `UPDATE po_lines
       SET status = 'Blocked'
       WHERE po_id IN (
         SELECT po_id FROM purchase_orders
         WHERE vendor_id = $1 AND status = 'Open'
       )
       AND status = 'Open'`,
      [vendorId],
    );

    // c) Block new ASN submissions: cancel any Submitted or Active ASNs
    await db.query(
      `UPDATE asns
       SET status = 'Cancelled'
       WHERE vendor_id = $1
         AND status IN ('Submitted', 'Active')`,
      [vendorId],
    );

    vendorsSuspended++;
  }

  return { warningsSent, vendorsSuspended };
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  const sqsQueueUrl = process.env['SQS_ALERT_EVENTS_URL'];

  if (!databaseUrl) {
    console.error('[expiry-alerts] ERROR: DATABASE_URL env var is required');
    process.exit(1);
  }
  if (!sqsQueueUrl) {
    console.error('[expiry-alerts] ERROR: SQS_ALERT_EVENTS_URL env var is required');
    process.exit(1);
  }

  const db = new Pool({ connectionString: databaseUrl });
  const sqsClient = new SQSClient({});

  try {
    console.log('[expiry-alerts] Starting compliance document expiry check...');
    const summary = await runExpiryAlerts(db, sqsClient, sqsQueueUrl);
    console.log(
      `[expiry-alerts] Done. ${summary.warningsSent} warnings sent, ${summary.vendorsSuspended} vendors suspended.`,
    );
  } catch (err) {
    console.error('[expiry-alerts] Fatal error:', err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Only run main() when executed directly (not when imported in tests)
if (process.argv[1]?.endsWith('expiry-alerts.js') || process.argv[1]?.endsWith('expiry-alerts.ts')) {
  main();
}
