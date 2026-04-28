import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { VendorService } from './vendor.service.js';
import type { DocumentType } from '@sumosave/shared-types';

export default async function vendorRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new VendorService(fastify.db, fastify.dbRead);

  // POST /api/v1/vendors — no auth required for registration
  fastify.post('/api/v1/vendors', async (request, reply) => {
    const body = request.body as {
      dc_id: string;
      vendor_code: string;
      name: string;
      gstin: string;
    };

    try {
      const vendor = await svc.createVendor(body.dc_id, {
        vendor_code: body.vendor_code,
        name: body.name,
        gstin: body.gstin,
      });
      return reply.code(201).send(vendor);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('INVALID_GSTIN')) {
        return reply.code(400).send({ error: 'INVALID_GSTIN', message });
      }
      throw err;
    }
  });

  // PUT /api/v1/vendors/:id/documents — Vendor_User or Admin_User
  fastify.put(
    '/api/v1/vendors/:id/documents',
    { preHandler: requireRole('Vendor_User', 'Admin_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        doc_type: DocumentType;
        s3_key: string;
        expiry_date?: string;
      };

      const user = request.user;
      const deviceId = (request.headers['x-device-id'] as string) ?? 'unknown';

      const doc = await svc.uploadDocument(
        id,
        body.doc_type,
        body.s3_key,
        user.user_id,
        body.expiry_date ?? null,
        user.dc_id,
        deviceId,
      );

      return reply.code(200).send(doc);
    },
  );

  // GET /api/v1/vendors/:id/compliance-status — Finance_User or Admin_User
  fastify.get(
    '/api/v1/vendors/:id/compliance-status',
    { preHandler: requireRole('Finance_User', 'Admin_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const status = await svc.getComplianceStatus(id);
        return reply.code(200).send(status);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('VENDOR_NOT_FOUND')) {
          return reply.code(404).send({ error: 'VENDOR_NOT_FOUND', message });
        }
        throw err;
      }
    },
  );

  // PUT /api/v1/vendors/:id/approve — Admin_User only
  fastify.put(
    '/api/v1/vendors/:id/approve',
    { preHandler: requireRole('Admin_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      const deviceId = (request.headers['x-device-id'] as string) ?? 'unknown';

      try {
        const vendor = await svc.approveVendor(id, user.user_id, deviceId, user.dc_id);
        return reply.code(200).send(vendor);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.startsWith('MISSING_MANDATORY_DOCS') ||
          message.startsWith('EXPIRED_MANDATORY_DOCS')
        ) {
          return reply.code(422).send({ error: 'COMPLIANCE_INCOMPLETE', message });
        }
        if (message.startsWith('VENDOR_NOT_FOUND')) {
          return reply.code(404).send({ error: 'VENDOR_NOT_FOUND', message });
        }
        throw err;
      }
    },
  );
  // POST /api/v1/vendors/:id/second-approve — Vendor_Manager only
  fastify.post(
    '/api/v1/vendors/:id/second-approve',
    { preHandler: requireRole('Vendor_Manager') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      const deviceId = (request.headers['x-device-id'] as string) ?? 'unknown';

      try {
        const vendor = await svc.secondApproveVendor(id, user.user_id, deviceId, user.dc_id);
        return reply.code(200).send(vendor);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('VENDOR_NOT_FOUND')) {
          return reply.code(404).send({ error: 'VENDOR_NOT_FOUND', message });
        }
        if (message.startsWith('Same user') || message.startsWith('VENDOR_NOT_PENDING_SECOND_APPROVAL')) {
          return reply.code(400).send({ error: 'BAD_REQUEST', message });
        }
        throw err;
      }
    },
  );

  // GET /api/v1/vendors — Leadership_Analytics_User, Inbound_Supervisor, Admin_User
  fastify.get(
    '/api/v1/vendors',
    { preHandler: requireRole('Leadership_Analytics_User', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const query = request.query as {
        search?: string;
        limit?: string;
        offset?: string;
      };

      const result = await svc.listVendors(request.user.dc_id, {
        ...(query.search && { search: query.search }),
        ...(query.limit && { limit: parseInt(query.limit, 10) }),
        ...(query.offset && { offset: parseInt(query.offset, 10) }),
      });

      return reply.code(200).send(result);
    },
  );

  // GET /api/v1/vendors/:id/documents — Vendor_User, Finance_User, Admin_User
  fastify.get(
    '/api/v1/vendors/:id/documents',
    { preHandler: requireRole('Vendor_User', 'Finance_User', 'Admin_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // If Vendor_User, ensure they are accessing their own data
      // (This assumes we add vendor_id to JWT for Vendor_User roles)
      // For now, in dev mode, we allow it.

      const result = await fastify.dbRead.query(
        `SELECT * FROM vendor_documents WHERE vendor_id = $1 ORDER BY uploaded_at DESC`,
        [id],
      );

      return reply.code(200).send(result.rows);
    },
  );
}

