import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { ASNService, type CreateASNPayload } from './asn.service.js';
import { AlertService } from '../alerts/alert.service.js';

export default async function asnRoutes(fastify: FastifyInstance): Promise<void> {
  const alertSvc = new AlertService(fastify.db, fastify.sqsClient);
  const svc = new ASNService(fastify.db, fastify.dbRead, alertSvc);

  // POST /api/v1/asns — submit ASN (Vendor_User, Inbound_Supervisor, BnM_User)
  fastify.post(
    '/api/v1/asns',
    { preHandler: requireRole('Vendor_User', 'Inbound_Supervisor', 'BnM_User') },
    async (request, reply) => {
      const payload = request.body as CreateASNPayload;

      // Validate required fields
      if (!payload.dc_id || !payload.vendor_id || !payload.po_id || !payload.channel || !payload.lines) {
        return reply.code(400).send({
          error: 'INVALID_PAYLOAD',
          message: 'dc_id, vendor_id, po_id, channel, and lines are required',
        });
      }

      if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
        return reply.code(400).send({
          error: 'INVALID_LINES',
          message: 'lines must be a non-empty array',
        });
      }

      // Validate data_completeness range
      if (
        payload.data_completeness === undefined ||
        payload.data_completeness < 0 ||
        payload.data_completeness > 1
      ) {
        return reply.code(400).send({
          error: 'INVALID_DATA_COMPLETENESS',
          message: 'data_completeness must be a number between 0.0 and 1.0',
        });
      }

      // Validate channel
      const validChannels = ['Portal', 'Email', 'Paper', 'BuyerFallback'];
      if (!validChannels.includes(payload.channel)) {
        return reply.code(400).send({
          error: 'INVALID_CHANNEL',
          message: `channel must be one of: ${validChannels.join(', ')}`,
        });
      }

      try {
        const asn = await svc.createASN(payload);
        return reply.code(201).send(asn);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('PO_NOT_FOUND')) {
          return reply.code(404).send({
            error: 'PO_NOT_FOUND',
            message: 'The referenced PO does not exist',
            details: message,
          });
        }

        if (message.startsWith('PO_NOT_OPEN')) {
          return reply.code(400).send({
            error: 'PO_NOT_OPEN',
            message: 'The referenced PO is not in Open status',
            details: message,
          });
        }

        if (message.startsWith('INACTIVE_SKUS')) {
          return reply.code(400).send({
            error: 'INACTIVE_SKUS',
            message: 'One or more SKUs on the PO are not Active',
            details: message,
          });
        }

        throw err;
      }
    },
  );

  // GET /api/v1/asns/:id/confidence — retrieve confidence score (Inbound_Supervisor, Dock_Manager)
  fastify.get(
    '/api/v1/asns/:id/confidence',
    { preHandler: requireRole('Inbound_Supervisor', 'Dock_Manager', 'Admin_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const confidence = await svc.getASNConfidence(id);
        return reply.code(200).send(confidence);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('ASN_NOT_FOUND')) {
          return reply.code(404).send({
            error: 'ASN_NOT_FOUND',
            message: 'The requested ASN does not exist',
            details: message,
          });
        }

        throw err;
      }
    },
  );
}
