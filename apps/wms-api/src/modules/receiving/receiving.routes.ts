import type { FastifyInstance } from 'fastify';
import { ReceivingService, type SubLineCaptureRequest } from './receiving.service.js';
import { requireRole } from '../../plugins/rbac.js';
import { AdminService } from '../admin/admin.service.js';

export default async function receivingRoutes(fastify: FastifyInstance) {
  const receivingService = new ReceivingService(fastify.db, fastify.sqsClient);
  const adminService = new AdminService(fastify.db);

  fastify.post('/api/v1/receiving/start', async (request, reply) => {
    const body = request.body as any;

    try {
      const result = await receivingService.startReceiving({
        delivery_id: body.delivery_id,
        yard_entry_id: body.yard_entry_id,
      });

      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/api/v1/receiving/scan', async (request, reply) => {
    const body = request.body as any;

    try {
      const result = await receivingService.submitScan({
        delivery_line_id: body.delivery_line_id,
        barcode: body.barcode,
        scanned_by: body.scanned_by,
        device_id: body.device_id,
      });

      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.put('/api/v1/receiving/lines/:id/qc-pass', async (request, reply) => {
    const params = request.params as any;
    const body = request.body as any;

    try {
      const result = await receivingService.qcPass({
        line_id: params.id,
        user_id: body.user_id,
      });

      if (!result.success) {
        return reply.code(400).send({ error: result.message });
      }

      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/receiving/lines/:id/sub-line
   * Gap #3: Add one batch/expiry lot to a delivery line.
   * Call multiple times for mixed-expiry deliveries.
   * Body: { batch_number, expiry_date, manufacture_date?, quantity, captured_by, device_id }
   */
  fastify.post('/api/v1/receiving/lines/:id/sub-line', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as Omit<SubLineCaptureRequest, 'line_id'>;

    try {
      const result = await receivingService.captureSubLine({
        line_id: params.id,
        batch_number: body.batch_number,
        expiry_date: body.expiry_date,
        manufacture_date: body.manufacture_date,
        quantity: Number(body.quantity),
        captured_by: body.captured_by,
        device_id: body.device_id,
      });

      return reply.code(201).send(result);
    } catch (error: any) {
      const status = error.message.startsWith('LINE_ALREADY_PASSED') ? 409
        : error.message.startsWith('LINE_NOT_FOUND') ? 404
        : error.message.startsWith('SUB_LINE_INVALID_QTY') ? 400
        : 400;
      return reply.code(status).send({ error: error.message });
    }
  });

  /**
   * GET /api/v1/receiving/lines/:id/policy
   * Returns the current computed policy for a delivery line (read-only).
   * Roles: QC_Worker, Inbound_Supervisor
   * Req 1.4
   */
  fastify.get(
    '/api/v1/receiving/lines/:id/policy',
    { preHandler: requireRole('QC_Worker', 'Inbound_Supervisor') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await receivingService.initLinePolicy(id, request.user.dc_id);
        return reply.code(200).send(result);
      } catch (error: any) {
        const status = error.message.startsWith('LINE_NOT_FOUND') ? 404
          : error.message.startsWith('UNKNOWN_PACKAGING_CLASS') ? 400
          : 400;
        return reply.code(status).send({ error: error.message });
      }
    },
  );

  /**
   * PUT /api/v1/receiving/lines/:id/policy/init
   * Computes and persists the scan policy for a delivery line.
   * Roles: QC_Worker, Inbound_Supervisor
   * Req 1.4
   */
  fastify.put(
    '/api/v1/receiving/lines/:id/policy/init',
    { preHandler: requireRole('QC_Worker', 'Inbound_Supervisor') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await receivingService.initLinePolicy(id, request.user.dc_id);
        return reply.code(200).send(result);
      } catch (error: any) {
        const status = error.message.startsWith('LINE_NOT_FOUND') ? 404
          : error.message.startsWith('UNKNOWN_PACKAGING_CLASS') ? 400
          : 400;
        return reply.code(status).send({ error: error.message });
      }
    },
  );

  /**
   * PUT /api/v1/receiving/lines/:id/override
   * Supervisor override of a scan compliance hard stop.
   * Role: Inbound_Supervisor only
   * Body: { reason_code: string }
   * Req 6.1–6.3
   */
  fastify.put(
    '/api/v1/receiving/lines/:id/override',
    { preHandler: requireRole('Inbound_Supervisor') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { reason_code: string };

      try {
        const result = await receivingService.supervisorOverride({
          line_id: id,
          user_id: request.user.user_id,
          user_roles: request.user.roles,
          reason_code: body.reason_code,
          device_id: request.headers['x-device-id'] as string ?? 'unknown',
          dc_id: request.user.dc_id,
        });

        if (!result.success) {
          const status = result.error === 'INSUFFICIENT_ROLE' ? 403 : 400;
          return reply.code(status).send({ error: result.error });
        }

        return reply.code(200).send(result);
      } catch (error: any) {
        return reply.code(400).send({ error: error.message });
      }
    },
  );

  /**
   * PUT /api/v1/receiving/lines/:id/count
   * Records physical_count (GunnyBag) or unit_count (Loose) on a delivery line.
   * Roles: QC_Worker, Inbound_Supervisor
   * Body: { count_type: 'physical_count' | 'unit_count', count_value: number }
   * Req 4.1, 4.4
   */
  fastify.put(
    '/api/v1/receiving/lines/:id/count',
    { preHandler: requireRole('QC_Worker', 'Inbound_Supervisor') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { count_type: 'physical_count' | 'unit_count'; count_value: number };

      try {
        await receivingService.recordCount({
          line_id: id,
          count_type: body.count_type,
          count_value: Number(body.count_value),
          recorded_by: request.user.user_id,
          device_id: request.headers['x-device-id'] as string ?? 'unknown',
        });

        return reply.code(200).send({ success: true });
      } catch (error: any) {
        return reply.code(400).send({ error: error.message });
      }
    },
  );

  /**
   * GET /api/v1/receiving/compliance
   * Returns a per-vendor compliance summary for the authenticated DC.
   * Roles: Inbound_Supervisor, DC_Manager, WMS_Admin
   * Query params: from_date, to_date
   * Req 9.3, 9.5
   */
  fastify.get(
    '/api/v1/receiving/compliance',
    { preHandler: requireRole('Inbound_Supervisor', 'DC_Manager', 'WMS_Admin') },
    async (request, reply) => {
      const query = request.query as { from_date?: string; to_date?: string };

      try {
        const rows = await adminService.getComplianceSummary(
          request.user.dc_id,
          query.from_date ?? new Date(0).toISOString(),
          query.to_date ?? new Date().toISOString(),
        );
        return reply.code(200).send(rows);
      } catch (error: any) {
        return reply.code(400).send({ error: error.message });
      }
    },
  );
}
