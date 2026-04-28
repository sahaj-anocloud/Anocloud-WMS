import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { BarcodeService } from './barcode.service.js';
import type { BarcodeType } from '@sumosave/shared-types';

export default async function barcodeRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new BarcodeService(fastify.db, fastify.dbRead);

  // POST /api/v1/barcodes — Admin_User or BnM_User
  fastify.post(
    '/api/v1/barcodes',
    { preHandler: requireRole('Admin_User', 'BnM_User') },
    async (request, reply) => {
      const body = request.body as {
        barcode: string;
        sku_id: string;
        barcode_type: BarcodeType;
        is_primary?: boolean;
      };

      try {
        const row = await svc.registerBarcode(
          body.barcode,
          body.sku_id,
          body.barcode_type,
          body.is_primary ?? false,
        );
        return reply.code(201).send(row);
      } catch (err: unknown) {
        if (err instanceof Error && (err as any).code === 'BARCODE_CONFLICT') {
          const conflict = err as any;
          return reply.code(409).send({
            error: 'BARCODE_CONFLICT',
            message: err.message,
            conflicting_sku: conflict.conflicting_sku,
          });
        }
        throw err;
      }
    },
  );

  // GET /api/v1/barcodes/:barcode — any authenticated user
  fastify.get(
    '/api/v1/barcodes/:barcode',
    async (request, reply) => {
      const { barcode } = request.params as { barcode: string };

      try {
        const result = await svc.lookupBarcode(barcode);
        return reply.code(200).send(result);
      } catch (err: unknown) {
        if (err instanceof Error && (err as { code?: string }).code === 'BARCODE_NOT_FOUND') {
          return reply.code(404).send({ error: 'BARCODE_NOT_FOUND', message: err.message });
        }
        throw err;
      }
    },
  );

  // POST /api/v1/barcodes/:barcode/void — Admin_User only
  fastify.post(
    '/api/v1/barcodes/:barcode/void',
    { preHandler: requireRole('Admin_User') },
    async (request, reply) => {
      const { barcode } = request.params as { barcode: string };
      const user = request.user;

      try {
        await svc.voidBarcode(barcode, user.user_id, user.dc_id);
        return reply.code(200).send({ message: `Barcode ${barcode} voided successfully` });
      } catch (err: unknown) {
        return reply.code(400).send({ error: 'VOID_FAILED', message: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // POST /api/v1/barcodes/:barcode/reinstate — Admin_User only
  fastify.post(
    '/api/v1/barcodes/:barcode/reinstate',
    { preHandler: requireRole('Admin_User') },
    async (request, reply) => {
      const { barcode } = request.params as { barcode: string };
      const user = request.user;

      try {
        await svc.reinstateBarcode(barcode, user.user_id, user.dc_id);
        return reply.code(200).send({ message: `Barcode ${barcode} reinstated successfully` });
      } catch (err: unknown) {
        return reply.code(400).send({ error: 'REINSTATE_FAILED', message: err instanceof Error ? err.message : String(err) });
      }
    }
  );
}
