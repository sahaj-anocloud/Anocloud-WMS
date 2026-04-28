import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GKMService } from './gkm.service.js';

export async function gkmRoutes(fastify: FastifyInstance) {
  const gkmService = new GKMService(fastify.db);

  /**
   * POST /api/v1/gkm/check
   * Run GKM check for a delivery line
   */
  fastify.post<{
    Body: {
      deliveryLineId: string;
      invoiceUnitPrice: number;
    };
  }>(
    '/check',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deliveryLineId', 'invoiceUnitPrice'],
          properties: {
            deliveryLineId: { type: 'string', format: 'uuid' },
            invoiceUnitPrice: { type: 'number', minimum: 0 }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { deliveryLineId: string; invoiceUnitPrice: number } }>, reply: FastifyReply) => {
      try {
        const { deliveryLineId, invoiceUnitPrice } = request.body;
        const user = (request as any).user; // From JWT middleware

        const result = await gkmService.runGKMCheck({
          deliveryLineId,
          invoiceUnitPrice,
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
   * PUT /api/v1/gkm/:checkId/approve
   * Approve a GKM check (SoftStop or HardStop)
   */
  fastify.put<{
    Params: { checkId: string };
  }>(
    '/:checkId/approve',
    {
      schema: {
        params: {
          type: 'object',
          required: ['checkId'],
          properties: {
            checkId: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
      try {
        const { checkId } = request.params;
        const user = (request as any).user; // From JWT middleware

        await gkmService.approveGKMCheck({
          checkId,
          approverId: user.user_id,
          approverRole: user.roles?.[0] || 'unknown',
          deviceId: request.headers['x-device-id'] as string || 'unknown'
        });

        return reply.code(200).send({ message: 'GKM check approved successfully' });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  /**
   * PUT /api/v1/gkm/mrp-change
   * Propose an MRP change and validate against GKM thresholds
   */
  fastify.put<{
    Body: {
      deliveryLineId: string;
      skuId: string;
      newMRP: number;
      invoiceUnitPrice: number;
      reasonCode: string;
    };
  }>(
    '/mrp-change',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deliveryLineId', 'skuId', 'newMRP', 'invoiceUnitPrice', 'reasonCode'],
          properties: {
            deliveryLineId: { type: 'string', format: 'uuid' },
            skuId: { type: 'string', format: 'uuid' },
            newMRP: { type: 'number', minimum: 0 },
            invoiceUnitPrice: { type: 'number', minimum: 0 },
            reasonCode: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: { deliveryLineId: string; skuId: string; newMRP: number; invoiceUnitPrice: number; reasonCode: string } }>, reply: FastifyReply) => {
      try {
        const { deliveryLineId, skuId, newMRP, invoiceUnitPrice, reasonCode } = request.body;
        const user = (request as any).user;

        const result = await gkmService.proposeMRPChange({
          deliveryLineId,
          skuId,
          newMRP,
          invoiceUnitPrice,
          dcId: user.dc_id,
          userId: user.user_id,
          deviceId: request.headers['x-device-id'] as string || 'unknown',
          userRole: user.roles?.[0] || 'unknown', // Extracted from JWT
          reasonCode
        });

        return reply.code(200).send({
          message: 'MRP change approved and SKU master updated',
          result
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ error: error.message });
      }
    }
  );
}
