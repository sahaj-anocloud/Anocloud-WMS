import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PromoService } from './promo.service';

export async function promoRoutes(fastify: FastifyInstance) {
  const promoService = new PromoService(fastify.pg);

  /**
   * GET /api/v1/promo/:deliveryLineId/info
   * Get promotional item information and receiving instructions
   */
  fastify.get<{
    Params: { deliveryLineId: string };
  }>(
    '/:deliveryLineId/info',
    {
      schema: {
        params: {
          type: 'object',
          required: ['deliveryLineId'],
          properties: {
            deliveryLineId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { deliveryLineId: string } }>, reply: FastifyReply) => {
      try {
        const { deliveryLineId } = request.params;
        const user = (request as any).user; // From JWT middleware

        const result = await promoService.getPromoInfo(deliveryLineId, user.dc_id);

        return reply.code(200).send(result);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  /**
   * POST /api/v1/promo/receive
   * Process promotional item receiving
   */
  fastify.post<{
    Body: {
      deliveryLineId: string;
      receivedQty: number;
      freeQty?: number;
    };
  }>(
    '/receive',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deliveryLineId', 'receivedQty'],
          properties: {
            deliveryLineId: { type: 'string', format: 'uuid' },
            receivedQty: { type: 'number', minimum: 0 },
            freeQty: { type: 'number', minimum: 0 }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { deliveryLineId: string; receivedQty: number; freeQty?: number } }>, reply: FastifyReply) => {
      try {
        const { deliveryLineId, receivedQty, freeQty } = request.body;
        const user = (request as any).user; // From JWT middleware

        await promoService.processPromoReceiving({
          deliveryLineId,
          receivedQty,
          freeQty,
          dcId: user.dc_id,
          userId: user.user_id,
          deviceId: request.headers['x-device-id'] as string || 'unknown'
        });

        return reply.code(200).send({ message: 'Promotional item received successfully' });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );
}
