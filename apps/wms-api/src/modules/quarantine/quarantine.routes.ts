import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { QuarantineService } from './quarantine.service.js';

export default async function quarantineRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new QuarantineService(fastify.db, fastify.sqsClient);

  // POST /api/v1/quarantine — Inbound_Supervisor only
  // Places stock in quarantine atomically; blocks picks/dispatches. Req 14.1–14.5
  fastify.post(
    '/api/v1/quarantine',
    { preHandler: requireRole('Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const user = request.user;
      const body = request.body as {
        sku_id: string;
        lpn_id?: string;
        quantity: number;
        reason_code: string;
        is_perishable?: boolean;
      };

      const record = await svc.placeQuarantine({
        dcId: user.dc_id,
        skuId: body.sku_id,
        lpnId: body.lpn_id,
        quantity: body.quantity,
        reasonCode: body.reason_code,
        userId: user.user_id,
        deviceId: request.headers['x-device-id'] as string ?? 'unknown',
        isPerishable: body.is_perishable,
      });

      return reply.code(201).send(record);
    },
  );

  // PUT /api/v1/quarantine/:id/resolve — Inbound_Supervisor only
  // Resolves a quarantine hold with Accept / Reject / Dispose outcome. Req 14.6, 14.7
  fastify.put(
    '/api/v1/quarantine/:id/resolve',
    { preHandler: requireRole('Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const body = request.body as {
        outcome: 'Accept' | 'Reject' | 'Dispose';
        reason_code: string;
      };

      try {
        await svc.resolveQuarantine({
          quarantineId: id,
          dcId: user.dc_id,
          outcome: body.outcome,
          reasonCode: body.reason_code,
          userId: user.user_id,
          deviceId: request.headers['x-device-id'] as string ?? 'unknown',
        });

        return reply.code(200).send({ quarantine_id: id, outcome: body.outcome });
      } catch (err: unknown) {
        if (err instanceof Error && (err as { code?: string }).code === 'QUARANTINE_NOT_FOUND') {
          return reply.code(404).send({ error: 'QUARANTINE_NOT_FOUND' });
        }
        throw err;
      }
    },
  );

  // GET /api/v1/quarantine/active — active holds dashboard. Req 14.5
  fastify.get(
    '/api/v1/quarantine/active',
    { preHandler: requireRole('Inbound_Supervisor', 'Finance_User', 'Admin_User', 'Inventory_Controller') },
    async (request, reply) => {
      const holds = await svc.getActiveHolds(request.user.dc_id);
      return reply.code(200).send(holds);
    },
  );

  // PUT /api/v1/quarantine/:id/confirm-bin — Warehouse_Associate or higher
  // Confirms physical placement in quarantine bin via scan. Req 14.1
  fastify.put(
    '/api/v1/quarantine/:id/confirm-bin',
    { preHandler: requireRole('Warehouse_Associate', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };

      try {
        await svc.confirmBinScan(id, user.dc_id, user.user_id);
        return reply.code(200).send({ message: 'Quarantine bin placement confirmed' });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
  );
}
