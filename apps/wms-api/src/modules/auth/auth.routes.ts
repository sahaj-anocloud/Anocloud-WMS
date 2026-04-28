import type { FastifyInstance } from 'fastify';

/**
 * POST /api/v1/auth/login
 *
 * Development-mode login endpoint.
 * Maps frontend role IDs to WMS role arrays and issues a signed JWT.
 * Replace this with Keycloak / LDAP integration in production.
 *
 * JWT payload shape matches auth.ts: { sub, roles, dc_id }
 */

const ROLE_MAP: Record<string, string[]> = {
  scm_head:   ['Admin_User', 'Inbound_Supervisor', 'Leadership_Analytics_User', 'Finance_User'],
  supervisor: ['Inbound_Supervisor', 'Dock_Manager'],
  finance:    ['Finance_User', 'Inventory_Controller'],
  qc:         ['QC_Associate'],
  vendor:     ['Vendor_User'],
  gate:       ['Gate_Staff', 'Inbound_Supervisor'],
};

const USER_MAP: Record<string, string> = {
  scm_head:   'scm-head-001',
  supervisor: 'supervisor-001',
  finance:    'finance-001',
  qc:         'qc-associate-001',
  vendor:     'vendor-001',
  gate:       'gate-staff-001',
};

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as { role_id?: string; email?: string; password?: string };

    const roleId = body.role_id ?? body.email?.split('@')[0];

    if (!roleId || !ROLE_MAP[roleId]) {
      return reply.code(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'Unknown role or invalid credentials',
      });
    }

    const roles = ROLE_MAP[roleId];
    const userId = USER_MAP[roleId] ?? roleId;

    // Sign JWT with 8-hour expiry
    const token = fastify.jwt.sign(
      {
        sub: userId,
        roles,
        dc_id: 'DC-BLR-01',
      },
      { expiresIn: '8h' },
    );

    return reply.code(200).send({
      token,
      user_id: userId,
      roles,
      dc_id: 'DC-BLR-01',
      role_id: roleId,
      expires_in: 28800,
    });
  });
}
