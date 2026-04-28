import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GSTService } from './gst.service';

export async function gstRoutes(fastify: FastifyInstance) {
  const gstService = new GSTService(fastify.pg);

  /**
   * POST /api/v1/gst/check
   * Run GST check for a delivery line
   */
  fastify.post<{
    Body: {
      deliveryLineId: string;
      invoiceGstRate: number;
    };
  }>(
    '/check',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deliveryLineId', 'invoiceGstRate'],
          properties: {
            deliveryLineId: { type: 'string', format: 'uuid' },
            invoiceGstRate: { type: 'number', minimum: 0, maximum: 100 }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { deliveryLineId: string; invoiceGstRate: number } }>, reply: FastifyReply) => {
      try {
        const { deliveryLineId, invoiceGstRate } = request.body;
        const user = (request as any).user; // From JWT middleware

        const result = await gstService.runGSTCheck({
          deliveryLineId,
          invoiceGstRate,
          dcId: user.dc_id,
          userId: user.user_id,
          deviceId: request.headers['x-device-id'] as string || 'unknown'
        });

        return reply.code(200).send(result);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  /**
   * PUT /api/v1/gst/:checkId/resolve
   * Resolve a GST mismatch (Finance_User only)
   */
  fastify.put<{
    Params: { checkId: string };
    Body: { resolutionCode: string };
  }>(
    '/:checkId/resolve',
    {
      schema: {
        params: {
          type: 'object',
          required: ['checkId'],
          properties: {
            checkId: { type: 'string', format: 'uuid' }
          }
        },
        body: {
          type: 'object',
          required: ['resolutionCode'],
          properties: {
            resolutionCode: { type: 'string', minLength: 1, maxLength: 100 }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { checkId: string }; Body: { resolutionCode: string } }>, reply: FastifyReply) => {
      try {
        const { checkId } = request.params;
        const { resolutionCode } = request.body;
        const user = (request as any).user; // From JWT middleware

        await gstService.resolveGSTMismatch({
          checkId,
          resolverId: user.user_id,
          deviceId: request.headers['x-device-id'] as string || 'unknown',
          resolutionCode
        });

        return reply.code(200).send({ message: 'GST mismatch resolved successfully' });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );
}
