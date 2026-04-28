import type { Pool } from 'pg';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { writeAuditEvent } from '../../plugins/audit.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppointmentStatus = 'Requested' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow';

export interface AppointmentRow {
  appointment_id: string;
  dc_id: string;
  asn_id: string;
  vendor_id: string;
  dock_door: string;
  slot_start: string;
  slot_end: string;
  status: AppointmentStatus;
  is_heavy_truck: boolean;
}

export interface CreateAppointmentPayload {
  dc_id: string;
  asn_id: string;
  vendor_id: string;
  dock_door: string;
  slot_start: string; // ISO timestamp
  slot_end: string; // ISO timestamp
  is_heavy_truck: boolean;
}

export interface ConfirmAppointmentPayload {
  user_id: string;
  device_id: string;
}

export interface ScheduleBoardEntry {
  appointment_id: string;
  vendor_name: string;
  dock_door: string;
  slot_start: string;
  slot_end: string;
  status: AppointmentStatus;
  is_heavy_truck: boolean;
  dwell_time_minutes: number | null;
}

export interface ScheduleDeviationPayload {
  appointment_id: string;
  vendor_id: string;
  actual_arrival: string; // ISO timestamp
  dc_id: string;
}

// ─── AppointmentService ───────────────────────────────────────────────────────

export class AppointmentService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
    private readonly sqsClient: SQSClient,
    private readonly sqsQueueUrl: string,
  ) {}

  /**
   * Validates city window rule (BR-05):
   * Heavy truck deliveries must be scheduled between 12:00 and 16:00 local time.
   */
  private validateCityWindow(slotStart: Date, slotEnd: Date, isHeavyTruck: boolean): void {
    if (!isHeavyTruck) {
      return;
    }

    const startHour = slotStart.getUTCHours();
    const endHour = slotEnd.getUTCHours();
    const endMinute = slotEnd.getUTCMinutes();

    // Slot must be entirely within 12:00-16:00 window
    // Start must be >= 12:00 and end must be <= 16:00
    if (startHour < 12 || endHour > 16 || (endHour === 16 && endMinute > 0)) {
      throw new Error(
        `CITY_WINDOW_VIOLATION: Heavy truck deliveries must be scheduled between 12:00 and 16:00. Requested slot: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`,
      );
    }
  }

  /**
   * Application-layer validation for dock-slot collision.
   * The PostgreSQL EXCLUDE USING gist constraint is the hard guarantee,
   * but we validate here to provide better error messages.
   */
  private async validateDockSlotAvailability(
    dockDoor: string,
    slotStart: Date,
    slotEnd: Date,
  ): Promise<void> {
    const result = await this.dbRead.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM appointments
       WHERE dock_door = $1
         AND status = 'Confirmed'
         AND tstzrange(slot_start, slot_end) && tstzrange($2, $3)`,
      [dockDoor, slotStart.toISOString(), slotEnd.toISOString()],
    );

    const count = parseInt(result.rows[0]!.count, 10);
    if (count > 0) {
      throw new Error(
        `DOCK_SLOT_COLLISION: Dock door ${dockDoor} is already booked for the requested time slot`,
      );
    }
  }

  /**
   * Creates a new appointment request.
   * Validates:
   * - ASN exists and is active
   * - City window rule (BR-05) for heavy trucks
   * - Dock slot availability (application layer + DB constraint)
   */
  async createAppointment(payload: CreateAppointmentPayload): Promise<AppointmentRow> {
    // Validate ASN exists
    const asnResult = await this.dbRead.query<{ asn_id: string; status: string }>(
      `SELECT asn_id, status FROM asns WHERE asn_id = $1`,
      [payload.asn_id],
    );

    if (asnResult.rows.length === 0) {
      throw new Error(`ASN_NOT_FOUND: ${payload.asn_id}`);
    }

    const asn = asnResult.rows[0]!;
    if (asn.status !== 'Submitted' && asn.status !== 'Active') {
      throw new Error(`ASN_NOT_ACTIVE: ASN ${payload.asn_id} has status ${asn.status}`);
    }

    const slotStart = new Date(payload.slot_start);
    const slotEnd = new Date(payload.slot_end);

    // Validate city window rule (BR-05)
    this.validateCityWindow(slotStart, slotEnd, payload.is_heavy_truck);

    // Validate dock slot availability
    await this.validateDockSlotAvailability(payload.dock_door, slotStart, slotEnd);

    // Insert appointment (DB constraint will also prevent collisions)
    try {
      const insertResult = await this.db.query<AppointmentRow>(
        `INSERT INTO appointments (dc_id, asn_id, vendor_id, dock_door, slot_start, slot_end, status, is_heavy_truck)
         VALUES ($1, $2, $3, $4, $5, $6, 'Confirmed', $7)
         RETURNING *`,
        [
          payload.dc_id,
          payload.asn_id,
          payload.vendor_id,
          payload.dock_door,
          slotStart.toISOString(),
          slotEnd.toISOString(),
          payload.is_heavy_truck,
        ],
      );

      const appointment = insertResult.rows[0]!;

      // Write audit event
      await writeAuditEvent(this.db, {
        dc_id: payload.dc_id,
        event_type: 'APPOINTMENT_CREATED',
        user_id: 'system',
        device_id: 'vendor-portal',
        reference_doc: appointment.appointment_id,
        new_state: {
          appointment_id: appointment.appointment_id,
          asn_id: payload.asn_id,
          vendor_id: payload.vendor_id,
          dock_door: payload.dock_door,
          slot_start: payload.slot_start,
          slot_end: payload.slot_end,
          is_heavy_truck: payload.is_heavy_truck,
        },
      });

      return appointment;
    } catch (err: unknown) {
      // PostgreSQL EXCLUDE constraint violation
      if (err instanceof Error && 'code' in err && err.code === '23P01') {
        throw new Error(
          `DOCK_SLOT_COLLISION: Dock door ${payload.dock_door} is already booked for the requested time slot (DB constraint)`,
        );
      }
      throw err;
    }
  }

  /**
   * Confirms an appointment and sends confirmation notification to vendor via SQS.
   */
  async confirmAppointment(
    appointmentId: string,
    payload: ConfirmAppointmentPayload,
  ): Promise<AppointmentRow> {
    // Fetch appointment
    const appointmentResult = await this.dbRead.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE appointment_id = $1`,
      [appointmentId],
    );

    if (appointmentResult.rows.length === 0) {
      throw new Error(`APPOINTMENT_NOT_FOUND: ${appointmentId}`);
    }

    const appointment = appointmentResult.rows[0]!;

    if (appointment.status !== 'Requested' && appointment.status !== 'Confirmed') {
      throw new Error(
        `APPOINTMENT_NOT_CONFIRMABLE: Appointment ${appointmentId} has status ${appointment.status}`,
      );
    }

    // Update status to Confirmed
    const updateResult = await this.db.query<AppointmentRow>(
      `UPDATE appointments
       SET status = 'Confirmed'
       WHERE appointment_id = $1
       RETURNING *`,
      [appointmentId],
    );

    const confirmedAppointment = updateResult.rows[0]!;

    // Send confirmation notification via SQS
    const messageBody = JSON.stringify({
      alert_type: 'APPOINTMENT_CONFIRMED',
      appointment_id: confirmedAppointment.appointment_id,
      vendor_id: confirmedAppointment.vendor_id,
      dock_door: confirmedAppointment.dock_door,
      slot_start: confirmedAppointment.slot_start,
      slot_end: confirmedAppointment.slot_end,
      dc_id: confirmedAppointment.dc_id,
    });

    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.sqsQueueUrl,
        MessageBody: messageBody,
      }),
    );

    // Write audit event
    await writeAuditEvent(this.db, {
      dc_id: confirmedAppointment.dc_id,
      event_type: 'APPOINTMENT_CONFIRMED',
      user_id: payload.user_id,
      device_id: payload.device_id,
      reference_doc: appointmentId,
      new_state: {
        appointment_id: appointmentId,
        status: 'Confirmed',
        confirmed_by: payload.user_id,
        confirmed_at_ms: Date.now(),
      },
    });

    return confirmedAppointment;
  }

  /**
   * Retrieves the dock schedule board with all confirmed appointments,
   * current dock status, and dwell times.
   */
  async getScheduleBoard(dcId: string): Promise<ScheduleBoardEntry[]> {
    const result = await this.dbRead.query<{
      appointment_id: string;
      vendor_name: string;
      dock_door: string;
      slot_start: string;
      slot_end: string;
      status: AppointmentStatus;
      is_heavy_truck: boolean;
      gate_in_timestamp: string | null;
    }>(
      `SELECT
         a.appointment_id,
         v.name AS vendor_name,
         a.dock_door,
         a.slot_start,
         a.slot_end,
         a.status,
         a.is_heavy_truck,
         ye.gate_in_timestamp
       FROM appointments a
       JOIN vendors v ON a.vendor_id = v.vendor_id
       LEFT JOIN yard_entries ye ON ye.asn_id = a.asn_id AND ye.status IN ('InYard', 'AtDock')
       WHERE a.dc_id = $1
         AND a.status = 'Confirmed'
       ORDER BY a.slot_start ASC`,
      [dcId],
    );

    return result.rows.map((row) => {
      let dwellTimeMinutes: number | null = null;
      if (row.gate_in_timestamp) {
        const gateIn = new Date(row.gate_in_timestamp);
        const now = new Date();
        dwellTimeMinutes = Math.floor((now.getTime() - gateIn.getTime()) / (1000 * 60));
      }

      return {
        appointment_id: row.appointment_id,
        vendor_name: row.vendor_name,
        dock_door: row.dock_door,
        slot_start: row.slot_start,
        slot_end: row.slot_end,
        status: row.status,
        is_heavy_truck: row.is_heavy_truck,
        dwell_time_minutes: dwellTimeMinutes,
      };
    });
  }

  /**
   * Logs a schedule deviation event when vendor arrives > 30 minutes outside confirmed window.
   * Updates vendor on-time delivery score.
   */
  async logScheduleDeviation(payload: ScheduleDeviationPayload): Promise<void> {
    // Fetch appointment
    const appointmentResult = await this.dbRead.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE appointment_id = $1`,
      [payload.appointment_id],
    );

    if (appointmentResult.rows.length === 0) {
      throw new Error(`APPOINTMENT_NOT_FOUND: ${payload.appointment_id}`);
    }

    const appointment = appointmentResult.rows[0]!;
    const actualArrival = new Date(payload.actual_arrival);
    const slotStart = new Date(appointment.slot_start);
    const slotEnd = new Date(appointment.slot_end);

    // Calculate deviation in minutes
    let deviationMinutes = 0;
    if (actualArrival < slotStart) {
      deviationMinutes = Math.floor((slotStart.getTime() - actualArrival.getTime()) / (1000 * 60));
    } else if (actualArrival > slotEnd) {
      deviationMinutes = Math.floor((actualArrival.getTime() - slotEnd.getTime()) / (1000 * 60));
    }

    // Only log if deviation > 30 minutes
    if (deviationMinutes > 30) {
      // Write audit event
      await writeAuditEvent(this.db, {
        dc_id: payload.dc_id,
        event_type: 'SCHEDULE_DEVIATION',
        user_id: 'system',
        device_id: 'gate-app',
        reference_doc: payload.appointment_id,
        new_state: {
          appointment_id: payload.appointment_id,
          vendor_id: payload.vendor_id,
          actual_arrival: payload.actual_arrival,
          slot_start: appointment.slot_start,
          slot_end: appointment.slot_end,
          deviation_minutes: deviationMinutes,
        },
      });

      // TODO: Update vendor on-time delivery score
      // This would typically update a vendor_scorecard table or similar
      // For now, we just log the deviation event
    }
  }
}
