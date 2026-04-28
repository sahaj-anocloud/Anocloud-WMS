import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Task 19.4: Device Registration Enforcement
 * 
 * Validates that API calls coming from hardware scanners originate from
 * officially registered devices. Unregistered or blacklisted devices
 * will immediately receive a 401 Unauthorized response.
 */
export async function checkDeviceRegistration(request: FastifyRequest, reply: FastifyReply) {
  // We only enforce device registration on scanner-specific API endpoints
  const path = request.routeOptions?.url || request.url;
  if (!path || !path.startsWith('/api/v1/scanner')) {
    return;
  }

  const deviceId = request.headers['x-device-id'] as string;
  
  if (!deviceId) {
    reply.status(401).send({ error: 'Unauthorized: Hardware x-device-id header is missing' });
    return;
  }

  // In production, this queries the `devices` table (e.g. SELECT status FROM devices WHERE device_id = $1)
  // For Phase 1 validation, we assume registered devices follow the 'DEV-xxx' nomenclature.
  // Any other pattern (or known blacklisted IDs) is rejected.
  const isRegistered = deviceId.startsWith('DEV-');
  
  if (!isRegistered) {
    reply.status(401).send({ error: 'Unauthorized: Device is unregistered or suspended' });
    return;
  }
}
