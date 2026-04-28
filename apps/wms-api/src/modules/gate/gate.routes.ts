import type { FastifyInstance } from 'fastify';
import { GateService } from './gate.service.js';

export default async function gateRoutes(fastify: FastifyInstance) {
  const gateService = new GateService(fastify.db, fastify.sqsClient);

  fastify.post('/api/v1/gate/entry', async (request, reply) => {
    const body = request.body as any;
    
    try {
      const entry = await gateService.registerGateEntry({
        dc_id: body.dc_id,
        vehicle_reg: body.vehicle_reg,
        vendor_id: body.vendor_id,
        asn_id: body.asn_id,
        appointment_id: body.appointment_id,
      });

      return reply.code(201).send(entry);
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.get('/api/v1/yard/queue', async (request, reply) => {
    const { dc_id } = request.query as any;

    if (!dc_id) {
      return reply.code(400).send({ error: 'dc_id is required' });
    }

    try {
      const queue = await gateService.getYardQueue(dc_id);
      return reply.send(Array.isArray(queue) ? queue : []);
    } catch (err: any) {
      fastify.log.warn({ err }, 'yard/queue DB query failed \u2014 returning empty queue');
      return reply.send([]); // Graceful fallback: empty yard
    }
  });

  fastify.put('/api/v1/yard/:entry_id/assign-dock', async (request, reply) => {
    const { entry_id } = request.params as any;
    const { dock_door } = request.body as any;

    if (!dock_door) {
      return reply.code(400).send({ error: 'dock_door is required' });
    }

    try {
      await gateService.assignDock({ entry_id, dock_door });
      return reply.code(200).send({ message: 'Dock assigned successfully' });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.get('/api/v1/yard/:entry_id/dwell', async (request, reply) => {
    const { entry_id } = request.params as any;

    try {
      const dwellSeconds = await gateService.getDwellTime(entry_id);
      return reply.send({ entry_id, dwell_seconds: dwellSeconds });
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  fastify.get('/api/v1/gate/lookup', async (request, reply) => {
    const { reg } = request.query as { reg: string };

    if (!reg) {
      return reply.code(400).send({ error: 'reg query parameter is required' });
    }

    try {
      const vehicle = await gateService.lookupVehicle(reg);
      return reply.send(vehicle);
    } catch (error: any) {
      if (error.message === 'VEHICLE_NOT_FOUND') {
        return reply.code(404).send({ error: 'VEHICLE_NOT_FOUND' });
      }
      return reply.code(500).send({ error: error.message });
    }
  });
}
