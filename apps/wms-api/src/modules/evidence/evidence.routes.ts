import type { FastifyInstance } from 'fastify';
import { EvidenceService, type EvidenceReferenceType, type EvidenceAttachmentType } from './evidence.service.js';

export default async function evidenceRoutes(fastify: FastifyInstance) {
  const evidenceService = new EvidenceService(fastify.db, fastify.s3Client);

  /**
   * POST /api/v1/evidence/upload-url
   * Gap #13 — Step 1: Client requests a pre-signed S3 PUT URL.
   * Body: { reference_type, reference_id, attachment_type, filename, mime_type,
   *          file_size_bytes, uploaded_by, device_id, dc_id }
   * Returns: { attachment_id, upload_url, s3_key, expires_at }
   *
   * Client PUTs the file directly to S3 using upload_url.
   * Then calls /confirm to complete the chain of custody.
   */
  fastify.post('/api/v1/evidence/upload-url', async (request, reply) => {
    const body = request.body as {
      reference_type: EvidenceReferenceType;
      reference_id: string;
      attachment_type: EvidenceAttachmentType;
      filename: string;
      mime_type: string;
      file_size_bytes: number;
      uploaded_by: string;
      device_id: string;
      dc_id: string;
    };

    try {
      const result = await evidenceService.getUploadUrl({
        referenceType: body.reference_type,
        referenceId: body.reference_id,
        attachmentType: body.attachment_type,
        filename: body.filename,
        mimeType: body.mime_type,
        fileSizeBytes: body.file_size_bytes ?? 0,
        uploadedBy: body.uploaded_by,
        deviceId: body.device_id,
        dcId: body.dc_id,
      });

      return reply.code(201).send(result);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/evidence/confirm
   * Gap #13 — Step 2: Client confirms the file was successfully PUT to S3.
   * Body: { attachment_id, confirmed_by, device_id, dc_id }
   * Returns: the full attachment row
   */
  fastify.post('/api/v1/evidence/confirm', async (request, reply) => {
    const body = request.body as {
      attachment_id: string;
      confirmed_by: string;
      device_id: string;
      dc_id: string;
    };

    try {
      const result = await evidenceService.confirmUpload(
        body.attachment_id,
        body.confirmed_by,
        body.device_id,
        body.dc_id,
      );
      return reply.code(200).send(result);
    } catch (error: any) {
      const status = error.message.startsWith('ATTACHMENT_NOT_FOUND') ? 404 : 400;
      return reply.code(status).send({ error: error.message });
    }
  });

  /**
   * GET /api/v1/evidence/:referenceType/:referenceId
   * Retrieve all active attachments for a given entity.
   * Used by supervisor exception queue, finance hold view, and discrepancy detail.
   */
  fastify.get('/api/v1/evidence/:referenceType/:referenceId', async (request, reply) => {
    const params = request.params as {
      referenceType: EvidenceReferenceType;
      referenceId: string;
    };

    try {
      const rows = await evidenceService.getAttachments(
        params.referenceType,
        params.referenceId,
      );
      return reply.code(200).send(rows);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  /**
   * GET /api/v1/evidence/:attachmentId/view-url
   * Get a 5-minute pre-signed GET URL for viewing a single photo.
   */
  fastify.get('/api/v1/evidence/:attachmentId/view-url', async (request, reply) => {
    const params = request.params as { attachmentId: string };

    try {
      const url = await evidenceService.getViewUrl(params.attachmentId);
      return reply.code(200).send({ url, expires_in_seconds: 300 });
    } catch (error: any) {
      const status = error.message.startsWith('ATTACHMENT_NOT_FOUND') ? 404 : 400;
      return reply.code(status).send({ error: error.message });
    }
  });

  /**
   * DELETE /api/v1/evidence/:attachmentId
   * BR-16 / Item 328: Admin-only soft-delete. Audit trail preserved.
   * Body: { deleted_by, device_id, dc_id, reason_code }
   */
  fastify.delete('/api/v1/evidence/:attachmentId', async (request, reply) => {
    const params = request.params as { attachmentId: string };
    const body = request.body as {
      deleted_by: string;
      device_id: string;
      dc_id: string;
      reason_code: string;
    };

    // TODO: enforce Admin role check from JWT here
    try {
      await evidenceService.softDelete(
        params.attachmentId,
        body.deleted_by,
        body.device_id,
        body.dc_id,
        body.reason_code,
      );
      return reply.code(204).send();
    } catch (error: any) {
      const status = error.message.startsWith('ATTACHMENT_NOT_FOUND') ? 404 : 400;
      return reply.code(status).send({ error: error.message });
    }
  });
}
