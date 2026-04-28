import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { LPNService } from './lpn.service.js';

export default async function lpnRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new LPNService(fastify.db, (fastify as any).redis);

  // POST /api/v1/lpns/generate — WH_Associate, Inbound_Supervisor
  // Generates an LPN, writes lpns record, sends ZPL print job to dock-side printer.
  // Req 13.1–13.5, 13.8
  fastify.post(
    '/api/v1/lpns/generate',
    { preHandler: requireRole('WH_Associate', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const user = request.user;
      const body = request.body as {
        dc_code: string;
        sku_id: string;
        batch_number?: string;
        expiry_date?: string;
        location?: string;
        delivery_line_id?: string;
        printer_host?: string;
      };

      const lpn = await svc.generateLPN({
        dcCode: body.dc_code,
        skuId: body.sku_id,
        batchNumber: body.batch_number,
        expiryDate: body.expiry_date,
        location: body.location,
        deliveryLineId: body.delivery_line_id,
        userId: user.user_id,
        deviceId: request.headers['x-device-id'] as string ?? 'unknown',
        dcId: user.dc_id,
        printerHost: body.printer_host,
      });

      return reply.code(201).send(lpn);
    },
  );

  // GET /api/v1/lpns/:barcode — any authenticated user
  // Decodes LPN and returns SKU, batch, expiry, DC location.
  // Req 13.4
  fastify.get(
    '/api/v1/lpns/:barcode',
    async (request, reply) => {
      const { barcode } = request.params as { barcode: string };

      try {
        const result = await svc.getLPN(barcode);
        return reply.code(200).send(result);
      } catch (err: unknown) {
        if (err instanceof Error && (err as { code?: string }).code === 'LPN_NOT_FOUND') {
          return reply.code(404).send({ error: 'LPN_NOT_FOUND', lpn_barcode: barcode });
        }
        throw err;
      }
    },
  );

  // POST /api/v1/lpns/relabel — WH_Associate, Inbound_Supervisor
  // Initiates relabeling when scanned barcode does not resolve to an Active SKU.
  // Req 13.2, 13.6
  fastify.post(
    '/api/v1/lpns/relabel',
    { preHandler: requireRole('WH_Associate', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const user = request.user;
      const body = request.body as {
        dc_code: string;
        original_barcode: string;
        sku_id: string;
        reason: string;
        batch_number?: string;
        expiry_date?: string;
        location?: string;
        delivery_line_id?: string;
        printer_host?: string;
      };

      const lpn = await svc.relabel({
        dcId: user.dc_id,
        dcCode: body.dc_code,
        originalBarcode: body.original_barcode,
        skuId: body.sku_id,
        reason: body.reason,
        userId: user.user_id,
        deviceId: request.headers['x-device-id'] as string ?? 'unknown',
        batchNumber: body.batch_number,
        expiryDate: body.expiry_date,
        location: body.location,
        deliveryLineId: body.delivery_line_id,
        printerHost: body.printer_host,
      });

      return reply.code(201).send(lpn);
    },
  );

  // POST /api/v1/lpns/:id/reprint — WH_Associate, Inbound_Supervisor
  // Reprints LPN; records reprint event; flags is_reprinted = true.
  // Req 13.7
  fastify.post(
    '/api/v1/lpns/:id/reprint',
    { preHandler: requireRole('WH_Associate', 'Inbound_Supervisor', 'Admin_User') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const body = request.body as {
        reason_code: string;
        printer_host?: string;
        supervisor_token?: string;
      };

      try {
        const lpn = await svc.reprint({
          lpnId: id,
          dcId: user.dc_id,
          userId: user.user_id,
          deviceId: request.headers['x-device-id'] as string ?? 'unknown',
          reasonCode: body.reason_code,
          printerHost: body.printer_host,
          sessionId: request.headers['x-session-id'] as string ?? 'no-session',
          supervisorToken: body.supervisor_token,
        });

        return reply.code(200).send(lpn);
      } catch (err: unknown) {
        if (err instanceof Error) {
          const code = (err as { code?: string }).code;
          if (code === 'LPN_NOT_FOUND') {
            return reply.code(404).send({ error: 'LPN_NOT_FOUND' });
          }
          if (code === 'REPRINT_LIMIT_EXCEEDED') {
            return reply.code(403).send({ 
              error: 'REPRINT_LIMIT_EXCEEDED', 
              message: err.message,
              current_count: (err as any).currentCount
            });
          }
        }
        throw err;
      }
    },
  );
}
