import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * Task 12.5: S3 Glacier archive with WORM retention
 * 
 * Archives audit_events older than 365 days to S3 Glacier Deep Archive
 * with WORM (Write Once Read Many) retention enabled.
 * Then deletes the archived records from Aurora to maintain table performance.
 */
export async function runAuditArchiveJob(db: Pool) {
  const s3 = new S3Client({
    endpoint: process.env['AWS_ENDPOINT'] || 'http://127.0.0.1:4566',
    region: process.env['AWS_REGION'] || 'ap-south-1',
    credentials: {
      accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || 'test',
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || 'test',
    },
    forcePathStyle: true,
  });

  const BUCKET_NAME = process.env['AUDIT_ARCHIVE_BUCKET'] || 'sumosave-audit-archive-worm';

  try {
    // 1. Fetch records older than 365 days (Req 12.8)
    const query = `
      SELECT * FROM audit_events
      WHERE occurred_at < NOW() - INTERVAL '365 days'
      ORDER BY occurred_at ASC
      LIMIT 5000
    `;
    const { rows } = await db.query(query);

    if (rows.length === 0) {
      return;
    }

    // 2. Format as JSONL
    const jsonlData = rows.map(row => JSON.stringify(row)).join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    const objectKey = `audit_archive_${timestamp}_${Date.now()}.jsonl`;

    // 3. Upload to S3 Glacier Deep Archive
    // Note: S3 Object Lock (WORM) 7-year retention (Req 12.9) is configured at the bucket level policy.
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      Body: jsonlData,
      StorageClass: 'DEEP_ARCHIVE',
    }));

    // 4. Delete archived records from active Aurora DB to maintain performance
    const idsToDelete = rows.map(r => r.event_id);
    await db.query(
      `DELETE FROM audit_events WHERE event_id = ANY($1::uuid[])`,
      [idsToDelete]
    );

    console.log(`[AuditArchiveJob] Successfully archived and purged ${rows.length} records. S3 Key: ${objectKey}`);
  } catch (error) {
    console.error('[AuditArchiveJob] Failed to archive audit events:', error);
    throw error;
  }
}

export function startAuditArchiveJob(db: Pool) {
  // Run once on startup in dev to process backlogs
  runAuditArchiveJob(db).catch(console.error);
  
  // Cron schedule: Run every 24 hours
  setInterval(() => {
    runAuditArchiveJob(db).catch(console.error);
  }, 24 * 60 * 60 * 1000);
}
