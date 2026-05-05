import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { AdminService } from './admin.service.js';
import { ScanPolicyEngine } from '../receiving/scan-policy.engine.js';
import type { ScanPolicyConfig } from '../receiving/scan-policy.engine.js';

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new AdminService(fastify.db);
  const scanPolicyEngine = new ScanPolicyEngine(fastify.db, fastify.db);

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

  // GET /api/v1/admin/scan-policy — Get current scan policy config for DC. Req 8.1
  fastify.get(
    '/api/v1/admin/scan-policy',
    { preHandler: requireRole('WMS_Admin', 'DC_Manager', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      try {
        const policy = await svc.getScanPolicy(request.user.dc_id);
        return reply.code(200).send(policy);
      } catch (err: unknown) {
        throw err;
      }
    },
  );

  // PUT /api/v1/admin/scan-policy — Update scan policy config for DC. Req 8.2–8.6
  fastify.put(
    '/api/v1/admin/scan-policy',
    { preHandler: requireRole('WMS_Admin', 'DC_Manager') },
    async (request, reply) => {
      const body = request.body as { policy: ScanPolicyConfig; reason_code: string };

      try {
        const updated = await svc.updateScanPolicy(
          request.user.dc_id,
          body.policy,
          body.reason_code,
          request.user.user_id,
          request.headers['x-device-id'] as string ?? 'unknown',
        );
        return reply.code(200).send(updated);
      } catch (err: unknown) {
        if (err instanceof Error && (err as { code?: string }).code === 'INVALID_MODIFIER_RANGE') {
          return reply.code(400).send({ error: 'INVALID_MODIFIER_RANGE' });
        }
        throw err;
      }
    },
  );

  // GET /api/v1/admin/packaging-classes — List all packaging classes with current rules. Req 8.1
  fastify.get(
    '/api/v1/admin/packaging-classes',
    { preHandler: requireRole('WMS_Admin', 'DC_Manager', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      try {
        const rules = await scanPolicyEngine.listPackagingClassRules(request.user.dc_id);
        return reply.code(200).send(rules);
      } catch (err: unknown) {
        throw err;
      }
    },
  );
}
