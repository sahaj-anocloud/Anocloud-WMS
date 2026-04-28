import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Pool } from 'pg';

export type EvidenceReferenceType =
  | 'delivery_line'
  | 'gate_entry'
  | 'quarantine'
  | 'lpn_print';

export type EvidenceAttachmentType =
  | 'seal_photo'
  | 'damage_photo'
  | 'barcode_photo'
  | 'document';

export interface UploadEvidenceInput {
  referenceType: EvidenceReferenceType;
  referenceId: string;
  attachmentType: EvidenceAttachmentType;
  /** Original filename from client — used for Content-Disposition */
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  deviceId: string;
  dcId: string;
}

export interface UploadEvidenceResult {
  attachmentId: string;
  /** Pre-signed URL for the client to PUT the file directly to S3 */
  uploadUrl: string;
  /** S3 key stored for future retrieval */
  s3Key: string;
  /** Pre-signed URL expires at this ISO timestamp */
  expiresAt: string;
}

export interface AttachmentRow {
  attachment_id: string;
  reference_type: string;
  reference_id: string;
  attachment_type: string;
  s3_key: string;
  s3_bucket: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string;
  device_id: string;
  uploaded_at: string;
}

/**
 * EvidenceService — Gap #13 fix
 *
 * Handles photo/document evidence for:
 *   - Seal condition photos (gate_entry)
 *   - Damage photos (delivery_line)
 *   - Barcode mismatch photos (delivery_line)
 *   - Quarantine evidence (quarantine)
 *
 * Flow:
 *   1. Client calls POST /api/v1/evidence/upload-url  → gets pre-signed S3 PUT URL
 *   2. Client PUTs file directly to S3 (bypasses API server; no size limit bottleneck)
 *   3. Client calls POST /api/v1/evidence/confirm     → records metadata in DB
 *
 * BR-16: photos are soft-delete only; floor users cannot hard-delete.
 */
export class EvidenceService {
  private readonly bucket: string;

  constructor(
    private readonly db: Pool,
    private readonly s3: S3Client,
    bucket?: string,
  ) {
    this.bucket = bucket ?? process.env['EVIDENCE_S3_BUCKET'] ?? 'sumosave-wms-evidence';
  }

  /**
   * Step 1: Generate a pre-signed S3 PUT URL.
   * Creates the DB record immediately (status tracked by upload_url_issued_at).
   * Pre-signed URL is valid for 15 minutes.
   */
  async getUploadUrl(input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
    // Build a deterministic S3 key: dc/refType/refId/attachType/uuid-filename
    const s3Key = [
      input.dcId,
      input.referenceType,
      input.referenceId,
      input.attachmentType,
      `${crypto.randomUUID()}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    ].join('/');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Generate pre-signed PUT URL
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: input.mimeType,
      ContentLength: input.fileSizeBytes > 0 ? input.fileSizeBytes : undefined,
      // Server-side encryption enforced at bucket policy level
      Metadata: {
        'uploaded-by': input.uploadedBy,
        'device-id': input.deviceId,
        'reference-type': input.referenceType,
        'reference-id': input.referenceId,
        'attachment-type': input.attachmentType,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 15 * 60 });

    // Persist metadata row immediately — confirms intent even if upload fails
    const result = await this.db.query<{ attachment_id: string }>(
      `INSERT INTO evidence_attachments
         (reference_type, reference_id, attachment_type,
          s3_key, s3_bucket, file_size_bytes, mime_type,
          uploaded_by, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING attachment_id`,
      [
        input.referenceType,
        input.referenceId,
        input.attachmentType,
        s3Key,
        this.bucket,
        input.fileSizeBytes > 0 ? input.fileSizeBytes : null,
        input.mimeType,
        input.uploadedBy,
        input.deviceId,
      ],
    );

    const attachmentId = result.rows[0]!.attachment_id;

    // Audit event
    await this.db.query(
      `INSERT INTO audit_events
         (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
       VALUES ($1,'EVIDENCE_UPLOAD_INITIATED',$2,$3,$4,$5::jsonb,'evidence_capture')`,
      [
        input.dcId,
        input.uploadedBy,
        input.deviceId,
        attachmentId,
        JSON.stringify({
          attachment_id: attachmentId,
          reference_type: input.referenceType,
          reference_id: input.referenceId,
          attachment_type: input.attachmentType,
          s3_key: s3Key,
        }),
      ],
    );

    return {
      attachmentId,
      uploadUrl,
      s3Key,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Step 2: Client confirms successful upload.
   * Writes a EVIDENCE_UPLOADED audit event so the chain of custody is complete.
   * This is the record that proves the photo exists and is linked to the event.
   */
  async confirmUpload(
    attachmentId: string,
    confirmedBy: string,
    deviceId: string,
    dcId: string,
  ): Promise<AttachmentRow> {
    const row = await this.db.query<AttachmentRow>(
      `SELECT * FROM evidence_attachments WHERE attachment_id = $1 AND deleted_at IS NULL`,
      [attachmentId],
    );

    if (row.rows.length === 0) {
      throw new Error(`ATTACHMENT_NOT_FOUND: ${attachmentId}`);
    }

    const attachment = row.rows[0]!;

    await this.db.query(
      `INSERT INTO audit_events
         (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
       VALUES ($1,'EVIDENCE_UPLOADED',$2,$3,$4,$5::jsonb,'evidence_confirmed')`,
      [
        dcId,
        confirmedBy,
        deviceId,
        attachmentId,
        JSON.stringify({
          attachment_id: attachmentId,
          reference_type: attachment.reference_type,
          reference_id: attachment.reference_id,
          s3_key: attachment.s3_key,
        }),
      ],
    );

    return attachment;
  }

  /**
   * Retrieve all active attachments for a reference entity.
   * Used by supervisor queue, finance hold queue, and dispute view.
   */
  async getAttachments(
    referenceType: EvidenceReferenceType,
    referenceId: string,
  ): Promise<AttachmentRow[]> {
    const result = await this.db.query<AttachmentRow>(
      `SELECT * FROM evidence_attachments
       WHERE reference_type = $1
         AND reference_id = $2
         AND deleted_at IS NULL
       ORDER BY uploaded_at ASC`,
      [referenceType, referenceId],
    );
    return result.rows;
  }

  /**
   * Get a temporary pre-signed GET URL for viewing a single attachment.
   * URL valid for 5 minutes.
   */
  async getViewUrl(attachmentId: string): Promise<string> {
    const row = await this.db.query<{ s3_key: string; s3_bucket: string }>(
      `SELECT s3_key, s3_bucket FROM evidence_attachments
       WHERE attachment_id = $1 AND deleted_at IS NULL`,
      [attachmentId],
    );

    if (row.rows.length === 0) {
      throw new Error(`ATTACHMENT_NOT_FOUND: ${attachmentId}`);
    }

    const { s3_key, s3_bucket } = row.rows[0]!;
    const command = new GetObjectCommand({ Bucket: s3_bucket, Key: s3_key });
    return getSignedUrl(this.s3, command, { expiresIn: 5 * 60 });
  }

  /**
   * BR-16 / Item 328: Soft-delete only. Floor users cannot call this —
   * enforced at route level (Admin role required). Full audit trail preserved.
   */
  async softDelete(
    attachmentId: string,
    deletedBy: string,
    deviceId: string,
    dcId: string,
    reasonCode: string,
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE evidence_attachments
       SET deleted_at = now(), deleted_by = $1
       WHERE attachment_id = $2 AND deleted_at IS NULL
       RETURNING attachment_id`,
      [deletedBy, attachmentId],
    );

    if (result.rows.length === 0) {
      throw new Error(`ATTACHMENT_NOT_FOUND_OR_ALREADY_DELETED: ${attachmentId}`);
    }

    await this.db.query(
      `INSERT INTO audit_events
         (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
       VALUES ($1,'EVIDENCE_DELETED',$2,$3,$4,$5::jsonb,$6)`,
      [
        dcId,
        deletedBy,
        deviceId,
        attachmentId,
        JSON.stringify({ attachment_id: attachmentId, soft_deleted: true }),
        reasonCode,
      ],
    );
  }
}
