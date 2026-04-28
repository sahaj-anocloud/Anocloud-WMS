import type { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

export interface GateEntryRequest {
  dc_id: string;
  vehicle_reg: string;
  vendor_id: string;
  asn_id?: string;
  appointment_id?: string;
}

export interface YardEntry {
  entry_id: string;
  dc_id: string;
  vehicle_reg: string;
  vendor_id: string;
  asn_id?: string;
  appointment_id?: string;
  gate_in_at: Date;
  gate_out_at?: Date;
  dock_assigned_at?: Date;
  unloading_start?: Date;
  unloading_end?: Date;
  status: string;
}

export interface DockAssignment {
  entry_id: string;
  dock_door: string; // Matches zone_id in dock_zones
}

export interface GateOutRequest {
  entry_id: string;
  dc_id: string;
  override_token?: string;
  override_reason?: string;
  user_id?: string;
}

export class GateService {
  constructor(
    private db: Pool,
    private sqsClient: SQSClient
  ) {}

  async registerGateEntry(entry: GateEntryRequest): Promise<YardEntry> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Validate vendor has Active compliance status
      const vendorResult = await client.query(
        'SELECT compliance_status FROM vendors WHERE vendor_id = $1',
        [entry.vendor_id]
      );

      if (vendorResult.rows.length === 0) {
        throw new Error('Vendor not found');
      }

      if (vendorResult.rows[0].compliance_status !== 'Active') {
        throw new Error(`Vendor compliance status is ${vendorResult.rows[0].compliance_status}. Only Active vendors may enter.`);
      }

      // Validate confirmed appointment for today if appointment_id provided
      if (entry.appointment_id) {
        const appointmentResult = await client.query(
          `SELECT status, slot_start FROM appointments 
           WHERE appointment_id = $1 AND vendor_id = $2`,
          [entry.appointment_id, entry.vendor_id]
        );

        if (appointmentResult.rows.length === 0) {
          throw new Error('Appointment not found for this vendor');
        }

        const appointment = appointmentResult.rows[0];
        if (appointment.status !== 'Confirmed') {
          throw new Error(`Appointment status is ${appointment.status}. Only Confirmed appointments may proceed.`);
        }

        // Check if appointment is for today
        const slotDate = new Date(appointment.slot_start);
        const today = new Date();
        if (
          slotDate.getFullYear() !== today.getFullYear() ||
          slotDate.getMonth() !== today.getMonth() ||
          slotDate.getDate() !== today.getDate()
        ) {
          throw new Error('Appointment is not scheduled for today');
        }
      }

      // Check confidence score and MOQ policy if ASN is provided
      let enhanced_qc = false;
      if (entry.asn_id) {
        const asnScoreResult = await client.query(
          `SELECT confidence_score FROM asns WHERE asn_id = $1`,
          [entry.asn_id]
        );
        if (asnScoreResult.rows.length > 0) {
          const score = asnScoreResult.rows[0].confidence_score;
          if (score < 60) {
            enhanced_qc = true;
            await this.callQCEngine('LowConfidence', {
              asn_id: entry.asn_id,
              vendor_id: entry.vendor_id,
              vehicle_reg: entry.vehicle_reg
            });
          }
        }

        const asnResult = await client.query(
          `SELECT a.asn_id, po.sap_po_number
           FROM asns a
           JOIN purchase_orders po ON a.po_id = po.po_id
           WHERE a.asn_id = $1`,
          [entry.asn_id]
        );

          // Real MOQ Check (Requirement 6.3 / BR-05)
          const moqResult = await client.query(
            `SELECT vsp.moq_quantity, SUM(pol.ordered_qty) as total_qty, vsp.category_id
             FROM asns a
             JOIN po_lines pol ON a.po_id = pol.po_id
             JOIN skus s ON pol.sku_id = s.sku_id
             JOIN vendor_schedule_policies vsp ON a.vendor_id = vsp.vendor_id AND s.category = vsp.category_id
             WHERE a.asn_id = $1
             GROUP BY vsp.moq_quantity, vsp.category_id`,
            [entry.asn_id]
          );

          if (moqResult.rows.length > 0) {
            for (const row of moqResult.rows) {
              if (parseFloat(row.total_qty) < parseFloat(row.moq_quantity)) {
                await this.sendAlert('MOQ_VIOLATION', {
                  entry_id: entry.asn_id,
                  vendor_id: entry.vendor_id,
                  vehicle_reg: entry.vehicle_reg,
                  category_id: row.category_id,
                  actual_qty: parseFloat(row.total_qty),
                  min_qty: parseFloat(row.moq_quantity)
                });
              }
            }
          }

      }

      // Insert yard entry
      const insertResult = await client.query(
        `INSERT INTO yard_entries 
         (dc_id, vehicle_reg, vendor_id, asn_id, appointment_id, gate_in_at, status, enhanced_qc)
         VALUES ($1, $2, $3, $4, $5, now(), 'InYard', $6)
         RETURNING *`,
        [entry.dc_id, entry.vehicle_reg, entry.vendor_id, entry.asn_id || null, entry.appointment_id || null, enhanced_qc]
      );

      await client.query('COMMIT');

      return insertResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getYardQueue(dc_id: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT 
         ye.entry_id,
         ye.vehicle_reg,
         ye.vendor_id,
         v.name as vendor_name,
         ye.asn_id,
         ye.appointment_id,
         ye.gate_in_at,
         ye.dock_assigned_at,
         ye.status,
         EXTRACT(EPOCH FROM (now() - ye.gate_in_at)) as dwell_seconds,
         a.dock_door
       FROM yard_entries ye
       JOIN vendors v ON ye.vendor_id = v.vendor_id
       LEFT JOIN appointments a ON ye.appointment_id = a.appointment_id
       WHERE ye.dc_id = $1 AND ye.gate_out_at IS NULL
       ORDER BY ye.gate_in_at ASC`,
      [dc_id]
    );

    return result.rows;
  }

  async assignDock(assignment: DockAssignment): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Check temperature compatibility (Requirement 7.2 / Item 2 in request)
      const cargoTempResult = await client.query(
        `SELECT s.requires_cold, s.is_perishable 
         FROM yard_entries ye
         JOIN asns a ON ye.asn_id = a.asn_id
         JOIN po_lines pol ON a.po_id = pol.po_id
         JOIN skus s ON pol.sku_id = s.sku_id
         WHERE ye.entry_id = $1 AND (s.requires_cold = true OR s.is_perishable = true)
         LIMIT 1`,
        [assignment.entry_id]
      );

      const requiresCold = cargoTempResult.rows.length > 0;

      const dockResult = await client.query(
        `SELECT temp_class FROM dock_zones WHERE zone_id = $1`,
        [assignment.dock_door]
      );

      if (dockResult.rows.length === 0) {
        throw new Error(`DOCK_NOT_FOUND: ${assignment.dock_door}`);
      }

      const dockTemp = dockResult.rows[0].temp_class;

      if (requiresCold && dockTemp === 'Ambient') {
        throw new Error('Temperature mismatch — perishable load requires Cold zone');
      }

      // Update yard entry with dock assignment
      const result = await client.query(
        `UPDATE yard_entries 
         SET dock_assigned_at = now(), status = 'AtDock'
         WHERE entry_id = $1
         RETURNING *`,
        [assignment.entry_id]
      );

      if (result.rows.length === 0) {
        throw new Error('Yard entry not found');
      }

      const yardEntry = result.rows[0];

      // Notify Inbound_Supervisor via SQS
      await this.sendAlert('DOCK_ASSIGNED', {
        entry_id: assignment.entry_id,
        dock_door: assignment.dock_door,
        vendor_id: yardEntry.vendor_id,
        vehicle_reg: yardEntry.vehicle_reg,
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Vehicle Exit Enforcement (Item 1 in request)
   * Blocks exit unless GRN is complete or supervisor override is provided.
   */
  async registerGateOut(request: GateOutRequest): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const entryResult = await client.query(
        `SELECT ye.entry_id, d.status as delivery_status, ye.asn_id
         FROM yard_entries ye
         LEFT JOIN deliveries d ON ye.asn_id = d.asn_id
         WHERE ye.entry_id = $1 AND ye.dc_id = $2`,
        [request.entry_id, request.dc_id]
      );

      if (entryResult.rows.length === 0) {
        throw new Error('Yard entry not found');
      }

      const entry = entryResult.rows[0];

      // Enforcement Rule: Must be GRNComplete or have override
      const isGRNComplete = entry.delivery_status === 'GRNComplete';
      const hasOverride = !!request.override_token && !!request.override_reason;

      if (!isGRNComplete && !hasOverride) {
        const error = new Error('GRN not complete — supervisor override required');
        (error as any).statusCode = 403;
        throw error;
      }

      // Record override audit event
      if (!isGRNComplete && hasOverride) {
        await client.query(
          `INSERT INTO audit_events (
             dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            request.dc_id,
            'GATE_OUT_OVERRIDE',
            request.user_id || 'system',
            'system',
            request.entry_id,
            JSON.stringify({
              override_token: request.override_token,
              delivery_status: entry.delivery_status
            }),
            request.override_reason
          ]
        );
      }

      // Record exit
      await client.query(
        `UPDATE yard_entries 
         SET gate_out_at = now(), 
             status = 'Departed',
             exit_override_token = $1,
             exit_override_reason = $2,
             exit_override_by = $3
         WHERE entry_id = $4`,
        [
          request.override_token || null,
          request.override_reason || null,
          request.user_id || null,
          request.entry_id
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDwellTime(entry_id: string): Promise<number> {
    const result = await this.db.query(
      `SELECT EXTRACT(EPOCH FROM (now() - gate_in_at)) as dwell_seconds
       FROM yard_entries
       WHERE entry_id = $1`,
      [entry_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Yard entry not found');
    }

    return Math.floor(result.rows[0].dwell_seconds);
  }

  async lookupVehicle(reg: string): Promise<any> {
    // Search for an active ASN with this vehicle registration that hasn't entered the yard yet
    const result = await this.db.query(
      `SELECT 
         a.vehicle_number as vehicle_reg,
         a.asn_id,
         v.name as vendor_name,
         v.compliance_status
       FROM asns a
       JOIN vendors v ON a.vendor_id = v.vendor_id
       LEFT JOIN yard_entries ye ON a.asn_id = ye.asn_id
       WHERE a.vehicle_number = $1 
       AND a.status IN ('Submitted', 'Active')
       AND ye.entry_id IS NULL
       ORDER BY a.submitted_at DESC
       LIMIT 1`,
      [reg]
    );

    if (result.rows.length === 0) {
      throw new Error('VEHICLE_NOT_FOUND');
    }

    const data = result.rows[0];
    return {
      ...data,
      is_verified: true,
      compliance_status: data.compliance_status === 'Active' ? 'Compliant' : 'Non-Compliant'
    };
  }

  private async sendAlert(alertType: string, payload: any): Promise<void> {
    const queueUrl = process.env['ALERT_EVENTS_QUEUE_URL'];
    if (!queueUrl) {
      console.warn('ALERT_EVENTS_QUEUE_URL not configured, skipping alert');
      return;
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        alert_type: alertType,
        severity: 'Warning',
        triggered_at: new Date().toISOString(),
        payload,
      }),
    });

    await this.sqsClient.send(command);
  }

  private async callQCEngine(trigger: string, payload: any): Promise<void> {
    const queueUrl = process.env['QC_ENGINE_QUEUE_URL'];
    if (!queueUrl) {
      console.warn('QC_ENGINE_QUEUE_URL not configured, skipping QC engine call');
      return;
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        trigger: trigger,
        timestamp: new Date().toISOString(),
        payload,
      }),
    });

    await this.sqsClient.send(command);
  }
}
