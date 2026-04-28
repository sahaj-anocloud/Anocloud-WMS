import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { checkDeviceRegistration } from '../modules/integrations/device-registry.js';

export interface WMSUser {
  user_id: string;
  roles: string[];
  dc_id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: WMSUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; roles: string[]; dc_id: string };
    user: WMSUser;
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyJwt, {
    secret: process.env['JWT_SECRET'] ?? 'change-me-in-production',
  });

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
      const payload = request.user as unknown as { sub: string; roles: string[]; dc_id: string };
      request.user = {
        user_id: payload.sub,
        roles: payload.roles ?? [],
        dc_id: payload.dc_id ?? '',
      };
    } catch {
      // Routes that don't require auth (e.g. /health) will not throw here;
      // protected routes use requireRole which will reject unauthenticated requests.
    }
  });

  // Enforce hardware device registration (Task 19.4)
  fastify.addHook('preValidation', checkDeviceRegistration);
});
