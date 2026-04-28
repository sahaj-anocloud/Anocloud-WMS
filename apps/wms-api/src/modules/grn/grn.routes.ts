import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GRNService } from './grn.service';

export async function grnRoutes(fastify: FastifyInstance) {
  const grnService = new GRNService(fastify.db);

  /**
   * POST /api/v1/grn/initiate
   * Initiate Auto-GRN process (internal)
   */
  fastify.post<{
    Body: {
      deliveryId: string;
    };
  }>(
    '/initiate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deliveryId'],
          properties: {
            deliveryId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { deliveryId: string } }>, reply: FastifyReply) => {
      try {
        const { deliveryId } = request.body;
        const user = (request as any).user; // From JWT middleware

        await grnService.initiateAutoGRN({
          deliveryId,
          dcId: user.dc_id,
          userId: user.user_id,
          deviceId: request.headers['x-device-id'] as string || 'unknown'
        });

        return reply.code(200).send({ message: 'Auto-GRN initiated successfully' });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/grn/:deliveryId/status
   * Get real-time GRN status dashboard
   */
  fastify.get<{
    Params: { deliveryId: string };
  }>(
    '/:deliveryId/status',
    {
      schema: {
        params: {
          type: 'object',
          required: ['deliveryId'],
          properties: {
            deliveryId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { deliveryId: string } }>, reply: FastifyReply) => {
      try {
        const { deliveryId } = request.params;
        const user = (request as any).user; // From JWT middleware

        const status = await grnService.getGRNStatus(deliveryId, user.dc_id);

        return reply.code(200).send(status);
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );
  /**
   * POST /api/v1/grn/over-delivery-holds/:holdId/approve
   * Approve an over-delivery hold (requires Inbound_Manager role)
   */
  fastify.post<{
    Params: { holdId: string };
  }>(
    '/over-delivery-holds/:holdId/approve',
    {
      schema: {
        params: {
          type: 'object',
          required: ['holdId'],
          properties: {
            holdId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { holdId: string } }>, reply: FastifyReply) => {
      try {
        const { holdId } = request.params;
        const user = (request as any).user; // From JWT middleware

        // Requires Inbound_Manager role
        if (!user.roles || !user.roles.includes('Inbound_Manager')) {
          return reply.code(403).send({ error: 'Requires Inbound_Manager role' });
        }

        await grnService.approveOverDeliveryHold(
          holdId,
          user.user_id,
          user.dc_id,
          request.headers['x-device-id'] as string || 'unknown'
        );

        return reply.code(200).send({ message: 'Over-delivery hold approved and GRN retried' });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );
}
