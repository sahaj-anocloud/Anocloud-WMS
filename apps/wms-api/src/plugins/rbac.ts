import type { FastifyRequest, FastifyReply } from 'fastify';
import { writeAuditEvent } from './audit.js';

/**
 * Returns a Fastify preHandler that enforces role-based access control.
 * Unauthorised attempts return HTTP 403 and write an RBAC_VIOLATION audit event.
 */
export function requireRole(...roles: string[]) {
  return async function rbacPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const user = request.user;

    if (!user) {
      await reply.code(403).send({ error: 'FORBIDDEN', requiredRoles: roles });
      return;
    }

    const hasRole = roles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      // Write audit event — best-effort, do not block the 403 response on DB failure
      try {
        const fastify = request.server;
        await writeAuditEvent(fastify.db, {
          dc_id: user.dc_id,
          event_type: 'RBAC_VIOLATION',
          user_id: user.user_id,
          device_id: request.headers['x-device-id'] as string ?? 'unknown',
          reason_code: `Required roles: ${roles.join(', ')}`,
          new_state: {
            method: request.method,
            url: request.url,
            userRoles: user.roles,
            requiredRoles: roles,
          },
        });
      } catch {
        // Audit write failure must not prevent the 403 from being sent
      }

      await reply.code(403).send({ error: 'FORBIDDEN', requiredRoles: roles });
    }
  };
}
