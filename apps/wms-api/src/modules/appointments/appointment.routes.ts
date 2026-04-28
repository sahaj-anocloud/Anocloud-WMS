import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import {
  AppointmentService,
  type CreateAppointmentPayload,
  type ConfirmAppointmentPayload,
} from './appointment.service.js';

export default async function appointmentRoutes(fastify: FastifyInstance): Promise<void> {
  // SQS URL is optional in dev — real alerts won't fire but routes still work
  const sqsQueueUrl = process.env['SQS_ALERT_EVENTS_URL'] ?? '';
  const svc = new AppointmentService(fastify.db, fastify.dbRead, fastify.sqsClient, sqsQueueUrl);

  // POST /api/v1/appointments — request delivery slot (Vendor_User, Dock_Manager)
  fastify.post(
    '/api/v1/appointments',
    { preHandler: requireRole('Vendor_User', 'Dock_Manager', 'Inbound_Supervisor') },
    async (request, reply) => {
      const payload = request.body as CreateAppointmentPayload;

      // Validate required fields
      if (
        !payload.dc_id ||
        !payload.asn_id ||
        !payload.vendor_id ||
        !payload.dock_door ||
        !payload.slot_start ||
        !payload.slot_end
      ) {
        return reply.code(400).send({
          error: 'INVALID_PAYLOAD',
          message:
            'dc_id, asn_id, vendor_id, dock_door, slot_start, and slot_end are required',
        });
      }

      // Validate is_heavy_truck is boolean
      if (typeof payload.is_heavy_truck !== 'boolean') {
        return reply.code(400).send({
          error: 'INVALID_PAYLOAD',
          message: 'is_heavy_truck must be a boolean',
        });
      }

      // Validate slot_start and slot_end are valid ISO timestamps
      const slotStart = new Date(payload.slot_start);
      const slotEnd = new Date(payload.slot_end);

      if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
        return reply.code(400).send({
          error: 'INVALID_TIMESTAMP',
          message: 'slot_start and slot_end must be valid ISO timestamps',
        });
      }

      if (slotEnd <= slotStart) {
        return reply.code(400).send({
          error: 'INVALID_TIME_RANGE',
          message: 'slot_end must be after slot_start',
        });
      }

      try {
        const appointment = await svc.createAppointment(payload);
        return reply.code(201).send(appointment);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('ASN_NOT_FOUND')) {
          return reply.code(404).send({
            error: 'ASN_NOT_FOUND',
            message: 'The referenced ASN does not exist',
            details: message,
          });
        }

        if (message.startsWith('ASN_NOT_ACTIVE')) {
          return reply.code(400).send({
            error: 'ASN_NOT_ACTIVE',
            message: 'The referenced ASN is not in an active state',
            details: message,
          });
        }

        if (message.startsWith('CITY_WINDOW_VIOLATION')) {
          return reply.code(400).send({
            error: 'CITY_WINDOW_VIOLATION',
            message:
              'Heavy truck deliveries must be scheduled between 12:00 and 16:00',
            details: message,
          });
        }

        if (message.startsWith('DOCK_SLOT_COLLISION')) {
          return reply.code(409).send({
            error: 'DOCK_SLOT_COLLISION',
            message: 'The requested dock slot is already booked',
            details: message,
          });
        }

        throw err;
      }
    },
  );

  // PUT /api/v1/appointments/:id/confirm — confirm slot (Dock_Manager, Inbound_Supervisor)
  fastify.put(
    '/api/v1/appointments/:id/confirm',
    { preHandler: requireRole('Dock_Manager', 'Inbound_Supervisor') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as { user_id: string; device_id?: string };

      const payload: ConfirmAppointmentPayload = {
        user_id: user.user_id,
        device_id: user.device_id ?? 'unknown',
      };

      try {
        const appointment = await svc.confirmAppointment(id, payload);
        return reply.code(200).send(appointment);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('APPOINTMENT_NOT_FOUND')) {
          return reply.code(404).send({
            error: 'APPOINTMENT_NOT_FOUND',
            message: 'The requested appointment does not exist',
            details: message,
          });
        }

        if (message.startsWith('APPOINTMENT_NOT_CONFIRMABLE')) {
          return reply.code(400).send({
            error: 'APPOINTMENT_NOT_CONFIRMABLE',
            message: 'The appointment cannot be confirmed in its current state',
            details: message,
          });
        }

        throw err;
      }
    },
  );

  // GET /api/v1/appointments/schedule — dock schedule board (Dock_Manager, Inbound_Supervisor)
  fastify.get(
    '/api/v1/appointments/schedule',
    { preHandler: requireRole('Dock_Manager', 'Inbound_Supervisor', 'Admin_User', 'Vendor_User') },
    async (request, reply) => {
      const { dc_id } = request.query as { dc_id?: string };

      if (!dc_id) {
        return reply.code(400).send({
          error: 'INVALID_QUERY',
          message: 'dc_id query parameter is required',
        });
      }

      try {
        const schedule = await svc.getScheduleBoard(dc_id);
        return reply.code(200).send(schedule ?? []);
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'appointments/schedule DB query failed — returning empty schedule');
        return reply.code(200).send([]);
      }
    },
  );
}
