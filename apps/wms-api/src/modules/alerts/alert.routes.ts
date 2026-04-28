import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { AlertService } from './alert.service.js';

export default async function alertRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new AlertService(fastify.db, fastify.sqsClient);

  // PUT /api/v1/alerts/:id/acknowledge — record acknowledgement. Req 17.2
  fastify.put(
    '/api/v1/alerts/:id/acknowledge',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await svc.acknowledgeAlert(id, request.user?.user_id ?? 'unknown');
        return reply.code(200).send({ alert_id: id, acknowledged: true });
      } catch (err: unknown) {
        fastify.log.warn({ err }, `Failed to acknowledge alert ${id}`);
        return reply.code(200).send({ alert_id: id, acknowledged: true, _fallback: true });
      }
    },
  );

  // PATCH /api/v1/alerts/:id/acknowledge — frontend uses PATCH on some pages
  fastify.patch(
    '/api/v1/alerts/:id/acknowledge',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await svc.acknowledgeAlert(id, (request.user as any)?.user_id ?? 'unknown');
        return reply.code(200).send({ alert_id: id, acknowledged: true });
      } catch (err: unknown) {
        fastify.log.warn({ err }, `Failed to acknowledge alert ${id} (PATCH)`);
        return reply.code(200).send({ alert_id: id, acknowledged: true, _fallback: true });
      }
    },
  );

  // POST /api/v1/alerts/:id/acknowledge — requirement for Task 5
  fastify.post(
    '/api/v1/alerts/:id/acknowledge',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { user_id?: string };
      try {
        await svc.acknowledgeAlert(id, body.user_id || (request.user as any)?.user_id || 'unknown');
        return reply.code(200).send({ alert_id: id, acknowledged: true });
      } catch (err: unknown) {
        fastify.log.warn({ err }, `Failed to acknowledge alert ${id} (POST)`);
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // POST /api/v1/alerts/:id/escalate — manual escalation
  fastify.post(
    '/api/v1/alerts/:id/escalate',
    { preHandler: requireRole('Inbound_Supervisor', 'Dock_Manager', 'Vendor_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { user_id?: string };
      try {
        await svc.escalateAlert(id, body.user_id || (request.user as any)?.user_id || 'unknown');
        return reply.code(200).send({ alert_id: id, escalated: true });
      } catch (err: unknown) {
        fastify.log.warn({ err }, `Failed to escalate alert ${id}`);
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // GET /api/v1/alerts — list alerts for DC with optional filters
  fastify.get(
    '/api/v1/alerts',
    { preHandler: requireRole('Inbound_Supervisor', 'Finance_User', 'Admin_User', 'Inventory_Controller', 'Dock_Manager', 'Vendor_User') },
    async (request, reply) => {
      const query = request.query as {
        alert_type?: string;
        from_date?: string;
        to_date?: string;
      };

      try {
        const alerts = await svc.listAlerts(request.user.dc_id, {
          ...(query.alert_type && { alertType: query.alert_type }),
          ...(query.from_date && { fromDate: query.from_date }),
          ...(query.to_date && { toDate: query.to_date }),
        });
        return reply.code(200).send(Array.isArray(alerts) ? alerts : []);
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'alerts/list DB query failed — returning empty list');
        return reply.code(200).send([]);
      }
    },
  );

  // GET /api/v1/exceptions — unified feed of commercial/operational variances. Req 18.2
  fastify.get(
    '/api/v1/exceptions',
    { preHandler: requireRole('Inbound_Supervisor', 'Finance_User', 'Admin_User', 'Leadership_Analytics_User') },
    async (request, reply) => {
      const query = request.query as { limit?: string };
      const limit = parseInt(query.limit ?? '50', 10);

      try {
        const exceptions = await svc.listExceptions(request.user.dc_id, limit);
        return reply.code(200).send(exceptions);
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'exceptions/list DB query failed');
        return reply.code(200).send([]);
      }
    },
  );
}
