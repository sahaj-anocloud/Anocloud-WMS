import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { AppointmentService } from './appointment.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Pool {
  return {
    query: vi.fn(),
  } as unknown as Pool;
}

function makeSqsClient(): SQSClient {
  return {
    send: vi.fn().mockResolvedValue({}),
  } as unknown as SQSClient;
}

const QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789/Alert-Events';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AppointmentService', () => {
  describe('createAppointment', () => {
    it('creates appointment successfully with valid payload', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ asn_id: 'asn-123', status: 'Active' }],
      } as QueryResult);

      // Mock dock slot availability check
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ count: '0' }],
      } as QueryResult);

      // Mock appointment insert
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            dc_id: 'DC01',
            asn_id: 'asn-123',
            vendor_id: 'vendor-123',
            dock_door: 'D1',
            slot_start: '2024-01-15T12:00:00Z',
            slot_end: '2024-01-15T14:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: true,
          },
        ],
      } as QueryResult);

      // Mock audit event write
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      const result = await svc.createAppointment({
        dc_id: 'DC01',
        asn_id: 'asn-123',
        vendor_id: 'vendor-123',
        dock_door: 'D1',
        slot_start: '2024-01-15T12:00:00Z',
        slot_end: '2024-01-15T14:00:00Z',
        is_heavy_truck: true,
      });

      expect(result.appointment_id).toBe('appt-123');
      expect(result.status).toBe('Confirmed');
    });

    it('rejects heavy truck appointment outside city window (before 12:00)', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ asn_id: 'asn-123', status: 'Active' }],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await expect(
        svc.createAppointment({
          dc_id: 'DC01',
          asn_id: 'asn-123',
          vendor_id: 'vendor-123',
          dock_door: 'D1',
          slot_start: '2024-01-15T10:00:00Z', // 10:00 - before 12:00
          slot_end: '2024-01-15T11:00:00Z',
          is_heavy_truck: true,
        }),
      ).rejects.toThrow('CITY_WINDOW_VIOLATION');
    });

    it('rejects heavy truck appointment outside city window (after 16:00)', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ asn_id: 'asn-123', status: 'Active' }],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await expect(
        svc.createAppointment({
          dc_id: 'DC01',
          asn_id: 'asn-123',
          vendor_id: 'vendor-123',
          dock_door: 'D1',
          slot_start: '2024-01-15T16:00:00Z',
          slot_end: '2024-01-15T18:00:00Z', // 18:00 - after 16:00
          is_heavy_truck: true,
        }),
      ).rejects.toThrow('CITY_WINDOW_VIOLATION');
    });

    it('allows non-heavy truck appointment outside city window', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ asn_id: 'asn-123', status: 'Active' }],
      } as QueryResult);

      // Mock dock slot availability check
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ count: '0' }],
      } as QueryResult);

      // Mock appointment insert
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            dc_id: 'DC01',
            asn_id: 'asn-123',
            vendor_id: 'vendor-123',
            dock_door: 'D1',
            slot_start: '2024-01-15T10:00:00Z',
            slot_end: '2024-01-15T11:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: false,
          },
        ],
      } as QueryResult);

      // Mock audit event write
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      const result = await svc.createAppointment({
        dc_id: 'DC01',
        asn_id: 'asn-123',
        vendor_id: 'vendor-123',
        dock_door: 'D1',
        slot_start: '2024-01-15T10:00:00Z',
        slot_end: '2024-01-15T11:00:00Z',
        is_heavy_truck: false,
      });

      expect(result.appointment_id).toBe('appt-123');
    });

    it('rejects appointment when dock slot is already booked', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ asn_id: 'asn-123', status: 'Active' }],
      } as QueryResult);

      // Mock dock slot availability check - slot is occupied
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ count: '1' }],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await expect(
        svc.createAppointment({
          dc_id: 'DC01',
          asn_id: 'asn-123',
          vendor_id: 'vendor-123',
          dock_door: 'D1',
          slot_start: '2024-01-15T12:00:00Z',
          slot_end: '2024-01-15T14:00:00Z',
          is_heavy_truck: true,
        }),
      ).rejects.toThrow('DOCK_SLOT_COLLISION');
    });

    it('rejects appointment when ASN does not exist', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup - not found
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await expect(
        svc.createAppointment({
          dc_id: 'DC01',
          asn_id: 'asn-999',
          vendor_id: 'vendor-123',
          dock_door: 'D1',
          slot_start: '2024-01-15T13:00:00Z',
          slot_end: '2024-01-15T15:00:00Z',
          is_heavy_truck: true,
        }),
      ).rejects.toThrow('ASN_NOT_FOUND');
    });

    it('rejects appointment when ASN is not active', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock ASN lookup - cancelled status
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [{ asn_id: 'asn-123', status: 'Cancelled' }],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await expect(
        svc.createAppointment({
          dc_id: 'DC01',
          asn_id: 'asn-123',
          vendor_id: 'vendor-123',
          dock_door: 'D1',
          slot_start: '2024-01-15T13:00:00Z',
          slot_end: '2024-01-15T15:00:00Z',
          is_heavy_truck: true,
        }),
      ).rejects.toThrow('ASN_NOT_ACTIVE');
    });
  });

  describe('confirmAppointment', () => {
    it('confirms appointment and sends SQS notification', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock appointment lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            dc_id: 'DC01',
            asn_id: 'asn-123',
            vendor_id: 'vendor-123',
            dock_door: 'D1',
            slot_start: '2024-01-15T13:00:00Z',
            slot_end: '2024-01-15T15:00:00Z',
            status: 'Requested',
            is_heavy_truck: true,
          },
        ],
      } as QueryResult);

      // Mock appointment update
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            dc_id: 'DC01',
            asn_id: 'asn-123',
            vendor_id: 'vendor-123',
            dock_door: 'D1',
            slot_start: '2024-01-15T13:00:00Z',
            slot_end: '2024-01-15T15:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: true,
          },
        ],
      } as QueryResult);

      // Mock audit event write
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      const result = await svc.confirmAppointment('appt-123', {
        user_id: 'user-123',
        device_id: 'device-123',
      });

      expect(result.status).toBe('Confirmed');
      expect(sqs.send).toHaveBeenCalledTimes(1);

      // Verify SQS message structure
      const call = vi.mocked(sqs.send).mock.calls[0]![0] as any;
      const body = JSON.parse(call.input.MessageBody);
      expect(body.alert_type).toBe('APPOINTMENT_CONFIRMED');
      expect(body.appointment_id).toBe('appt-123');
      expect(body.vendor_id).toBe('vendor-123');
      expect(body.dock_door).toBe('D1');
    });

    it('rejects confirmation when appointment does not exist', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock appointment lookup - not found
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await expect(
        svc.confirmAppointment('appt-999', {
          user_id: 'user-123',
          device_id: 'device-123',
        }),
      ).rejects.toThrow('APPOINTMENT_NOT_FOUND');
    });
  });

  describe('getScheduleBoard', () => {
    it('returns schedule board with dwell times', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      const now = new Date();
      const gateInTime = new Date(now.getTime() - 45 * 60 * 1000); // 45 minutes ago

      // Mock schedule board query
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            vendor_name: 'Vendor A',
            dock_door: 'D1',
            slot_start: '2024-01-15T13:00:00Z',
            slot_end: '2024-01-15T15:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: true,
            gate_in_timestamp: gateInTime.toISOString(),
          },
          {
            appointment_id: 'appt-124',
            vendor_name: 'Vendor B',
            dock_door: 'D2',
            slot_start: '2024-01-15T14:00:00Z',
            slot_end: '2024-01-15T16:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: false,
            gate_in_timestamp: null,
          },
        ],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      const result = await svc.getScheduleBoard('DC01');

      expect(result).toHaveLength(2);
      expect(result[0]!.appointment_id).toBe('appt-123');
      expect(result[0]!.dwell_time_minutes).toBeGreaterThanOrEqual(44);
      expect(result[0]!.dwell_time_minutes).toBeLessThanOrEqual(46);
      expect(result[1]!.dwell_time_minutes).toBeNull();
    });
  });

  describe('logScheduleDeviation', () => {
    it('logs deviation when arrival is > 30 minutes late', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock appointment lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            dc_id: 'DC01',
            asn_id: 'asn-123',
            vendor_id: 'vendor-123',
            dock_door: 'D1',
            slot_start: '2024-01-15T13:00:00Z',
            slot_end: '2024-01-15T15:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: true,
          },
        ],
      } as QueryResult);

      // Mock audit event write
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await svc.logScheduleDeviation({
        appointment_id: 'appt-123',
        vendor_id: 'vendor-123',
        actual_arrival: '2024-01-15T15:45:00Z', // 45 minutes after slot_end
        dc_id: 'DC01',
      });

      // Verify audit event was written
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_events'),
        expect.arrayContaining([
          'DC01',
          'SCHEDULE_DEVIATION',
          'system',
          'gate-app',
          'appt-123',
        ]),
      );
    });

    it('does not log deviation when arrival is within 30 minutes', async () => {
      const db = makeDb();
      const dbRead = makeDb();
      const sqs = makeSqsClient();

      // Mock appointment lookup
      vi.mocked(dbRead.query).mockResolvedValueOnce({
        rows: [
          {
            appointment_id: 'appt-123',
            dc_id: 'DC01',
            asn_id: 'asn-123',
            vendor_id: 'vendor-123',
            dock_door: 'D1',
            slot_start: '2024-01-15T13:00:00Z',
            slot_end: '2024-01-15T15:00:00Z',
            status: 'Confirmed',
            is_heavy_truck: true,
          },
        ],
      } as QueryResult);

      const svc = new AppointmentService(db, dbRead, sqs, QUEUE_URL);

      await svc.logScheduleDeviation({
        appointment_id: 'appt-123',
        vendor_id: 'vendor-123',
        actual_arrival: '2024-01-15T15:20:00Z', // 20 minutes after slot_end
        dc_id: 'DC01',
      });

      // Verify audit event was NOT written
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
