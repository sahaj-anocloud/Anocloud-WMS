import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { AuditService } from './audit.service.js';

export default async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new AuditService(fastify.db);

  // GET /api/v1/audit/chain-of-custody/:lpn_barcode — Req 16.3, 16.4
  fastify.get(
    '/api/v1/audit/chain-of-custody/:lpn_barcode',
    { preHandler: requireRole('Admin_User', 'Finance_User', 'Inbound_Supervisor', 'Inventory_Controller') },
    async (request, reply) => {
      const { lpn_barcode } = request.params as { lpn_barcode: string };
      const result = await svc.getChainOfCustody(lpn_barcode, request.user.dc_id);
      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/audit/events — filtered audit log. Req 16.4
  fastify.get(
    '/api/v1/audit/events',
    { preHandler: requireRole('Admin_User', 'Finance_User', 'Inbound_Supervisor') },
    async (request, reply) => {
      const query = request.query as {
        from_date?: string;
        to_date?: string;
        event_type?: string;
        user_id?: string;
        reference_doc?: string;
        limit?: string;
      };

      const events = await svc.queryEvents({
        dcId: request.user.dc_id,
        fromDate: query.from_date,
        toDate: query.to_date,
        eventType: query.event_type,
        userId: query.user_id,
        referenceDoc: query.reference_doc,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });

      return reply.code(200).send(events);
    },
  );

  // POST /api/v1/audit/export — async S3 export. Req 16.7
  fastify.post(
    '/api/v1/audit/export',
    { preHandler: requireRole('Admin_User', 'Finance_User') },
    async (request, reply) => {
      const body = request.body as {
        format: 'CSV' | 'JSON';
        from_date?: string;
        to_date?: string;
        event_type?: string;
        reference_doc?: string;
      };

      const result = await svc.enqueueExport(
        request.user.dc_id,
        {
          fromDate: body.from_date,
          toDate: body.to_date,
          eventType: body.event_type,
          referenceDoc: body.reference_doc,
        },
        body.format,
        request.user.user_id,
      );

      return reply.code(202).send(result);
    },
  );
}
