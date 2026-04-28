import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { POService } from './po.service.js';
import type { SAPPOPayload } from './po.service.js';

export default async function poRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new POService(fastify.db, fastify.dbRead);

  // POST /internal/sap/po-sync — called by SAP Integration Service (no auth check)
  fastify.post('/internal/sap/po-sync', async (request, reply) => {
    const payload = request.body as SAPPOPayload;

    if (!payload.sap_po_number || !payload.dc_id || !payload.vendor_id || !Array.isArray(payload.lines)) {
      return reply.code(400).send({ error: 'INVALID_PAYLOAD', message: 'sap_po_number, dc_id, vendor_id, and lines are required' });
    }

    const result = await svc.syncFromSAP(payload);
    const statusCode = result.created ? 201 : 200;
    return reply.code(statusCode).send(result);
  });

  // GET /api/v1/purchase-orders/:id — Inbound_Supervisor or Admin_User or Vendor_User
  fastify.get(
    '/api/v1/purchase-orders/:id',
    { preHandler: requireRole('Inbound_Supervisor', 'Admin_User', 'Vendor_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const po = await svc.getPOStatus(id);
        return reply.code(200).send(po);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('PO_NOT_FOUND')) {
          return reply.code(404).send({ error: 'PO_NOT_FOUND', message });
        }
        throw err;
      }
    },
  );
}
