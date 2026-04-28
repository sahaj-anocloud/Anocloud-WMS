import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { AdminService } from './admin.service.js';

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new AdminService(fastify.db);

  // GET /api/v1/admin/config — Admin_User only. Req 19.3
  fastify.get(
    '/api/v1/admin/config',
    { preHandler: requireRole('Admin_User') },
    async (request, reply) => {
      const config = await svc.getConfig(request.user.dc_id);
      return reply.code(200).send(config);
    },
  );

  // PUT /api/v1/admin/config/:key — Admin_User only. Req 19.3, 19.4
  fastify.put(
    '/api/v1/admin/config/:key',
    { preHandler: requireRole('Admin_User') },
    async (request, reply) => {
      const { key } = request.params as { key: string };
      const body = request.body as { value: string; reason_code: string };

      try {
        const updated = await svc.updateConfig(
          request.user.dc_id,
          key,
          body.value,
          body.reason_code,
          request.user.user_id,
          request.headers['x-device-id'] as string ?? 'unknown',
        );
        return reply.code(200).send(updated);
      } catch (err: unknown) {
        if (err instanceof Error && (err as { code?: string }).code === 'INVALID_CONFIG_KEY') {
          return reply.code(400).send({ error: 'INVALID_CONFIG_KEY', key });
        }
        throw err;
      }
    },
  );

  // GET /api/v1/admin/dock-zones — List facility docks.
  fastify.get(
    '/api/v1/admin/dock-zones',
    { preHandler: requireRole('Inbound_Supervisor', 'Admin_User', 'Dock_Manager') },
    async (request, reply) => {
      const zones = await svc.getDockZones(request.user.dc_id);
      return reply.code(200).send(zones);
    },
  );
}
