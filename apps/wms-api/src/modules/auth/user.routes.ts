/**
 * User Management Routes
 *
 * POST   /api/v1/users              — create user (Admin_User only)
 * GET    /api/v1/users              — list users for DC (Admin_User only)
 * PUT    /api/v1/users/:id/roles    — update user roles (Admin_User only)
 * PUT    /api/v1/users/:id/profile  — update user profile (Admin_User only)
 * DELETE /api/v1/users/:id          — deactivate user (Admin_User only)
 * GET    /api/v1/users/roles        — list all available roles (Admin_User only)
 */

import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { UserService, ALL_ROLES, ROLE_CONFIG } from './user.service.js';
import type { WMSRole, CreateUserInput } from './user.service.js';

export default async function userRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new UserService(fastify.db, fastify.dbRead);

  // GET /api/v1/users/roles — list all available roles with metadata
  fastify.get(
    '/api/v1/users/roles',
    { preHandler: requireRole('Admin_User', 'WMS_Admin') },
    async (_request, reply) => {
      const roles = ALL_ROLES.map((role) => ({
        role_name: role,
        ...ROLE_CONFIG[role],
      }));
      return reply.code(200).send(roles);
    },
  );

  // POST /api/v1/users — create a new user
  fastify.post(
    '/api/v1/users',
    { preHandler: requireRole('Admin_User', 'WMS_Admin') },
    async (request, reply) => {
      const body = request.body as CreateUserInput;
      try {
        const user = await svc.createUser(body, request.user.user_id);
        return reply.code(201).send(user);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('DUPLICATE_EMAIL')) return reply.code(409).send({ error: 'DUPLICATE_EMAIL', message: msg });
        if (msg.startsWith('INVALID_INPUT'))   return reply.code(400).send({ error: 'INVALID_INPUT', message: msg });
        throw err;
      }
    },
  );

  // GET /api/v1/users — list all users for the DC
  fastify.get(
    '/api/v1/users',
    { preHandler: requireRole('Admin_User', 'WMS_Admin') },
    async (request, reply) => {
      try {
        const users = await svc.listUsers(request.user.dc_id);
        return reply.code(200).send({ data: users, total: users.length });
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'users/list failed');
        return reply.code(200).send({ data: [], total: 0 });
      }
    },
  );

  // PUT /api/v1/users/:id/roles — replace user's roles
  fastify.put(
    '/api/v1/users/:id/roles',
    { preHandler: requireRole('Admin_User', 'WMS_Admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { roles: WMSRole[] };
      if (!Array.isArray(body.roles) || body.roles.length === 0) {
        return reply.code(400).send({ error: 'INVALID_INPUT', message: 'roles array is required' });
      }
      await svc.updateUserRoles(id, body.roles, request.user.dc_id, request.user.user_id);
      return reply.code(200).send({ user_id: id, roles: body.roles });
    },
  );

  // PUT /api/v1/users/:id/profile — update user profile fields
  fastify.put(
    '/api/v1/users/:id/profile',
    { preHandler: requireRole('Admin_User', 'WMS_Admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { full_name?: string; email?: string; phone?: string };
      await svc.updateUserProfile(id, body, request.user.dc_id, request.user.user_id);
      return reply.code(200).send({ user_id: id, updated: true });
    },
  );

  // DELETE /api/v1/users/:id — deactivate user (removes roles, keeps profile)
  fastify.delete(
    '/api/v1/users/:id',
    { preHandler: requireRole('Admin_User', 'WMS_Admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await svc.deactivateUser(id, request.user.dc_id, request.user.user_id);
      return reply.code(200).send({ user_id: id, deactivated: true });
    },
  );
}
