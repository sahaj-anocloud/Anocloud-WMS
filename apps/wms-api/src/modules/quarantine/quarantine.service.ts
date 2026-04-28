import { Pool, PoolClient } from 'pg';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

export interface PlaceQuarantineInput {
  dcId: string;
  skuId: string;
  lpnId?: string | undefined;
  quantity: number;
  reasonCode: string;
  userId: string;
  deviceId: string;
  isPerishable?: boolean | undefined;
  entryId?: string | undefined;
}

export interface ResolveQuarantineInput {
  quarantineId: string;
  dcId: string;
  outcome: 'Accept' | 'Reject' | 'Dispose';
  reasonCode: string;
  userId: string;
  deviceId: string;
}

export interface ActiveHoldRow {
  quarantine_id: string;
  dc_id: string;
  sku_id: string;
  lpn_id?: string;
  quantity: number;
  reason_code: string;
  physical_location?: string;
  financial_status: string;
  placed_by: string;
  placed_at: string;
  hours_open: number;
  bin_confirmed_at?: string;
  bin_confirmed_by?: string;
  entry_id?: string;
  gate_entry_time?: string;
}

export class QuarantineService {
  constructor(
    private readonly db: Pool,
    private readonly sqsClient: SQSClient,
    private readonly alertQueueUrl: string = process.env['SQS_ALERT_QUEUE_URL'] ?? '',
  ) {}

  /**
   * Places stock in quarantine atomically.
   * - Sets financial_status = 'Held'
   * - Moves qty from Available → Held in inventory_ledger
   * - Applies BR-14: perishable → ColdZone physical location
   * - Blocks all picks/dispatches on this stock
   * - Records QUARANTINE_PLACED audit event
   * Req 14.1–14.4, 14.9
   */
  async placeQuarantine(input: PlaceQuarantineInput): Promise<ActiveHoldRow> {
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Deduct from Available ledger (will throw if insufficient)
      await this.adjustLedger(client, input.dcId, input.skuId, 'Available', -input.quantity);
      // Add to Held ledger
      await this.adjustLedger(client, input.dcId, input.skuId, 'Held', input.quantity);

      // BR-14: Resolve physical zone from dock_zones master data
      const tempClass = input.isPerishable ? 'Cold' : 'Ambient';
      const zoneResult = await client.query(
        `SELECT zone_id FROM dock_zones 
         WHERE dc_id = $1 AND temp_class = $2 AND status = 'Active' 
         ORDER BY zone_id ASC LIMIT 1`,
        [input.dcId, tempClass]
      );

      if (zoneResult.rows.length === 0) {
        throw new Error(`NO_ACTIVE_ZONE: No active ${tempClass} zone found for DC ${input.dcId}`);
      }

      const physicalLocation = zoneResult.rows[0].zone_id;

      const result = await client.query<ActiveHoldRow>(
        `INSERT INTO quarantine_records
           (dc_id, sku_id, lpn_id, quantity, reason_code, physical_location,
            financial_status, placed_by, entry_id)
         VALUES ($1,$2,$3,$4,$5,$6,'Held',$7,$8)
         RETURNING *,
           EXTRACT(EPOCH FROM (now() - COALESCE((SELECT gate_entry_time FROM yard_entries WHERE entry_id = $8), placed_at))) / 3600 AS hours_open`,
        [
          input.dcId,
          input.skuId,
          input.lpnId ?? null,
          input.quantity,
          input.reasonCode,
          physicalLocation,
          input.userId,
          input.entryId ?? null,
        ],
      );

      const record = result.rows[0]!;

      await client.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
         VALUES ($1,'QUARANTINE_PLACED',$2,$3,$4,$5,$6)`,
        [
          input.dcId,
          input.userId,
          input.deviceId,
          record.quarantine_id,
          JSON.stringify({
            sku_id: input.skuId,
            quantity: input.quantity,
            physical_location: physicalLocation,
            financial_status: 'Held',
          }),
          input.reasonCode,
        ],
      );

      await client.query('COMMIT');
      return record;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Resolves a quarantine hold.
   * Accept → Available | Reject → Rejected | Dispose → Disposed
   * Records resolution in audit_events.
   * Req 14.6, 14.7
   */
  async resolveQuarantine(input: ResolveQuarantineInput): Promise<void> {
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      const fetchResult = await client.query<ActiveHoldRow>(
        `SELECT * FROM quarantine_records
         WHERE quarantine_id = $1 AND dc_id = $2 AND financial_status = 'Held'
         FOR UPDATE`,
        [input.quarantineId, input.dcId],
      );

      if (fetchResult.rows.length === 0) {
        throw Object.assign(
          new Error(`QUARANTINE_NOT_FOUND: ${input.quarantineId}`),
          { code: 'QUARANTINE_NOT_FOUND' },
        );
      }

      const record = fetchResult.rows[0]!;

      // BR: Bin Confirmation Enforcement (Item 4 in request)
      // Block resolution unless bin is confirmed or disposition is Reject
      if (input.outcome !== 'Reject' && !record.bin_confirmed_at) {
        throw new Error('Bin scan confirmation required before disposition');
      }

      // Map outcome to new financial status
      const newFinancialStatus =
        input.outcome === 'Accept'
          ? 'Released'
          : input.outcome === 'Reject'
            ? 'Rejected'
            : 'Disposed';

      // Ledger transition: move from Held to target state
      await this.adjustLedger(client, input.dcId, record.sku_id, 'Held', -record.quantity);

      if (input.outcome === 'Accept') {
        await this.adjustLedger(client, input.dcId, record.sku_id, 'Available', record.quantity);
      } else if (input.outcome === 'Reject') {
        await this.adjustLedger(client, input.dcId, record.sku_id, 'Rejected', record.quantity);
      }
      // Dispose: quantity is simply removed from Held — no addition elsewhere

      // Update quarantine record
      await client.query(
        `UPDATE quarantine_records
         SET financial_status = $1, resolved_by = $2, resolved_at = now(), resolution = $3
         WHERE quarantine_id = $4`,
        [newFinancialStatus, input.userId, input.outcome, input.quarantineId],
      );

      await client.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc,
            previous_state, new_state, reason_code)
         VALUES ($1,'QUARANTINE_RESOLVED',$2,$3,$4,$5,$6,$7)`,
        [
          input.dcId,
          input.userId,
          input.deviceId,
          input.quarantineId,
          JSON.stringify({ financial_status: 'Held', quantity: record.quantity }),
          JSON.stringify({ financial_status: newFinancialStatus, outcome: input.outcome }),
          input.reasonCode,
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Returns all active quarantine holds for a DC.
   * Req 14.5
   */
  async getActiveHolds(dcId: string): Promise<ActiveHoldRow[]> {
    const result = await this.db.query<ActiveHoldRow>(
      `SELECT qr.*, ye.gate_entry_time,
         EXTRACT(EPOCH FROM (now() - COALESCE(ye.gate_entry_time, qr.placed_at))) / 3600 AS hours_open
       FROM quarantine_records qr
       LEFT JOIN yard_entries ye ON ye.entry_id = qr.entry_id
       WHERE qr.dc_id = $1 AND qr.financial_status = 'Held'
       ORDER BY COALESCE(ye.gate_entry_time, qr.placed_at) ASC`,
      [dcId],
    );
    return result.rows;
  }

  /**
   * Confirms the physical placement of quarantined stock in a bin.
   * Required before 'Accept' or 'Dispose' resolution.
   */
  async confirmBinScan(quarantineId: string, dcId: string, userId: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE quarantine_records 
       SET bin_confirmed_at = now(), bin_confirmed_by = $1
       WHERE quarantine_id = $2 AND dc_id = $3 AND financial_status = 'Held'
       RETURNING *`,
      [userId, quarantineId, dcId]
    );

    if (result.rows.length === 0) {
      throw new Error('QUARANTINE_NOT_FOUND or already resolved');
    }
  }

  /**
   * Checks for holds open > 4 hours and publishes QUARANTINE_OPEN_4H alerts.
   * Called by background worker every 15 minutes.
   * Req 14.8
   */
  async checkAndAlertOpenHolds(): Promise<void> {
    const result = await this.db.query<{ quarantine_id: string; dc_id: string; sku_id: string; placed_at: string }>(
      `SELECT quarantine_id, dc_id, sku_id, placed_at
       FROM quarantine_records
       WHERE financial_status = 'Held'
         AND placed_at < now() - INTERVAL '90 minutes'`,
    );

    for (const row of result.rows) {
      // Insert alert
      const alertResult = await this.db.query<{ alert_id: string }>(
        `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, payload)
         VALUES ($1,'QUARANTINE_OPEN_4H','Warning',$2,$3)
         RETURNING alert_id`,
        [
          row.dc_id,
          row.quarantine_id,
          JSON.stringify({
            quarantine_id: row.quarantine_id,
            sku_id: row.sku_id,
            placed_at: row.placed_at,
          }),
        ],
      );

      const alertId = alertResult.rows[0]!.alert_id;

      // Publish to SQS Alert-Events queue
      if (this.alertQueueUrl) {
        try {
          await this.sqsClient.send(
            new SendMessageCommand({
              QueueUrl: this.alertQueueUrl,
              MessageBody: JSON.stringify({
                alert_id: alertId,
                alert_type: 'QUARANTINE_OPEN_4H',
                dc_id: row.dc_id,
                reference_doc: row.quarantine_id,
                target_roles: ['Inbound_Supervisor', 'Finance_User'],
              }),
            }),
          );
        } catch (sqsErr) {
          console.error('Failed to publish QUARANTINE_OPEN_4H to SQS:', sqsErr);
        }
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async adjustLedger(
    client: PoolClient,
    dcId: string,
    skuId: string,
    stockState: string,
    delta: number,
  ): Promise<void> {
    // Upsert the ledger row, then verify no negative
    await client.query(
      `INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (dc_id, sku_id, stock_state) DO NOTHING`,
      [dcId, skuId, stockState],
    );

    const result = await client.query<{ quantity: string }>(
      `UPDATE inventory_ledger
       SET quantity = quantity + $1, updated_at = now()
       WHERE dc_id = $2 AND sku_id = $3 AND stock_state = $4
       RETURNING quantity`,
      [delta, dcId, skuId, stockState],
    );

    const newQty = parseFloat(result.rows[0]!.quantity);
    if (newQty < 0) {
      throw Object.assign(
        new Error(
          `NEGATIVE_QUANTITY: ${stockState} for SKU ${skuId} in DC ${dcId} would be ${newQty}`,
        ),
        { code: 'NEGATIVE_QUANTITY' },
      );
    }
  }
}
