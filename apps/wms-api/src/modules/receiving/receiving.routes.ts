import type { FastifyInstance } from 'fastify';
import { ReceivingService, type SubLineCaptureRequest } from './receiving.service.js';

export default async function receivingRoutes(fastify: FastifyInstance) {
  const receivingService = new ReceivingService(fastify.db, fastify.sqsClient);

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
}
