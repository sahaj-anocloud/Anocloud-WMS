import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { SKUService } from './sku.service.js';
import type { SKUCategory } from '@sumosave/shared-types';

export default async function skuRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new SKUService(fastify.db, fastify.dbRead);

  // POST /api/v1/skus — BnM_User or Admin_User
  fastify.post(
    '/api/v1/skus',
    { preHandler: requireRole('BnM_User', 'Admin_User') },
    async (request, reply) => {
      const body = request.body as {
        dc_id?: string;
        sku_code: string;
        name: string;
        category: SKUCategory;
        packaging_class: string;
        is_ft?: boolean;
        is_perishable?: boolean;
        requires_cold?: boolean;
        gst_rate: number;
        mrp: number;
        length_mm?: number;
        width_mm?: number;
        height_mm?: number;
        weight_g?: number;
        barcodes?: Array<{ barcode: string; barcode_type: string; is_primary?: boolean }>;
      };

      const dcId = body.dc_id ?? request.user.dc_id;

      try {
        const sku = await svc.createSKU(dcId, body);
        return reply.code(201).send(sku);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('DUPLICATE_SKU')) {
          return reply.code(409).send({ error: 'DUPLICATE_SKU', message });
        }
        throw err;
      }
    },
  );

  // PUT /api/v1/skus/:id — BnM_User or Admin_User
  fastify.put(
    '/api/v1/skus/:id',
    { preHandler: requireRole('BnM_User', 'Admin_User') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        packaging_class?: string;
        is_ft?: boolean;
        is_perishable?: boolean;
        requires_cold?: boolean;
        gst_rate?: number;
        mrp?: number;
        length_mm?: number;
        width_mm?: number;
        height_mm?: number;
        weight_g?: number;
        reason_code?: string;
      };

      const user = request.user;
      const deviceId = (request.headers['x-device-id'] as string) ?? 'unknown';

      try {
        const sku = await svc.updateSKU(id, body, user.user_id, deviceId, user.dc_id);
        return reply.code(200).send(sku);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('SKU_NOT_FOUND')) {
          return reply.code(404).send({ error: 'SKU_NOT_FOUND', message });
        }
        throw err;
      }
    },
  );

  // POST /api/v1/skus/bulk-import — Admin_User only
  fastify.post(
    '/api/v1/skus/bulk-import',
    { preHandler: requireRole('Admin_User') },
    async (request, reply) => {
      const body = request.body as {
        dc_id?: string;
        rows: Array<Record<string, unknown>>;
      };

      const dcId = body.dc_id ?? request.user.dc_id;

      try {
        const result = await svc.bulkImportSKUs(dcId, body.rows as never);
        return reply.code(201).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('BULK_IMPORT_VALIDATION_FAILED')) {
          return reply.code(422).send({ error: 'BULK_IMPORT_VALIDATION_FAILED', message });
        }
        throw err;
      }
    },
  );
  // GET /api/v1/skus — Leadership_Analytics_User, Inbound_Supervisor, Admin_User, Vendor_User
  fastify.get(
    '/api/v1/skus',
    { preHandler: requireRole('Leadership_Analytics_User', 'Inbound_Supervisor', 'Admin_User', 'Vendor_User') },
    async (request, reply) => {
      const query = request.query as {
        search?: string;
        category?: SKUCategory;
        limit?: string;
        offset?: string;
      };

      const result = await svc.listSKUs(request.user.dc_id, {
        ...(query.search && { search: query.search }),
        ...(query.category && { category: query.category }),
        ...(query.limit && { limit: parseInt(query.limit, 10) }),
        ...(query.offset && { offset: parseInt(query.offset, 10) }),
      });

      return reply.code(200).send(result);
    },
  );
}
