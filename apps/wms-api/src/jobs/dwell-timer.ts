import { Pool } from 'pg';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export class DwellTimerWorker {
  constructor(
    private db: Pool,
    private sqsClient: SQSClient
  ) {}

  async checkVehicleDwell(): Promise<void> {
    try {
      // Find vehicles with dwell > 60 minutes and no dock assignment
      const result = await this.db.query(
        `SELECT 
           entry_id,
           vehicle_reg,
           vendor_id,
           dc_id,
           gate_in_at,
           EXTRACT(EPOCH FROM (now() - gate_in_at)) as dwell_seconds
         FROM yard_entries
         WHERE dock_assigned_at IS NULL
           AND gate_out_at IS NULL
           AND EXTRACT(EPOCH FROM (now() - gate_in_at)) > 3600`
      );

      for (const entry of result.rows) {
        await this.publishAlert('VEHICLE_DWELL_60M', {
          entry_id: entry.entry_id,
          vehicle_reg: entry.vehicle_reg,
          vendor_id: entry.vendor_id,
          dc_id: entry.dc_id,
          dwell_minutes: Math.floor(entry.dwell_seconds / 60),
        });
      }

      console.log(`Checked vehicle dwell: ${result.rows.length} alerts published`);
    } catch (error) {
      console.error('Error checking vehicle dwell:', error);
      throw error;
    }
  }

  async checkPerishableDwell(): Promise<void> {
    try {
      // Find perishable deliveries with unloading > 25 minutes and QC not passed
      const result = await this.db.query(
        `SELECT 
           d.delivery_id,
           ye.entry_id,
           ye.vehicle_reg,
           ye.vendor_id,
           ye.dc_id,
           ye.unloading_start,
           EXTRACT(EPOCH FROM (now() - ye.unloading_start)) as unloading_seconds
         FROM deliveries d
         JOIN yard_entries ye ON d.yard_entry_id = ye.entry_id
         JOIN delivery_lines dl ON d.delivery_id = dl.delivery_id
         JOIN skus s ON dl.sku_id = s.sku_id
         WHERE s.is_perishable = true
           AND ye.unloading_start IS NOT NULL
           AND dl.qc_status != 'Passed'
           AND EXTRACT(EPOCH FROM (now() - ye.unloading_start)) > 1500
         GROUP BY d.delivery_id, ye.entry_id, ye.vehicle_reg, ye.vendor_id, ye.dc_id, ye.unloading_start`
      );

      for (const entry of result.rows) {
        await this.publishAlert('PERISHABLE_DWELL_WARNING', {
          delivery_id: entry.delivery_id,
          entry_id: entry.entry_id,
          vehicle_reg: entry.vehicle_reg,
          vendor_id: entry.vendor_id,
          dc_id: entry.dc_id,
          unloading_minutes: Math.floor(entry.unloading_seconds / 60),
        });
      }

      console.log(`Checked perishable dwell: ${result.rows.length} alerts published`);
    } catch (error) {
      console.error('Error checking perishable dwell:', error);
      throw error;
    }
  }

  private async publishAlert(alertType: string, payload: any): Promise<void> {
    const queueUrl = process.env['ALERT_EVENTS_QUEUE_URL'];
    if (!queueUrl) {
      console.warn('ALERT_EVENTS_QUEUE_URL not configured, skipping alert');
      return;
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        alert_type: alertType,
        severity: 'Critical',
        triggered_at: new Date().toISOString(),
        payload,
      }),
    });

    await this.sqsClient.send(command);
  }

  async start(): Promise<void> {
    console.log('Starting dwell timer worker...');

    // Check vehicle dwell every 60 seconds
    setInterval(() => {
      this.checkVehicleDwell().catch(console.error);
    }, 60000);

    // Check perishable dwell every 5 minutes (300 seconds)
    setInterval(() => {
      this.checkPerishableDwell().catch(console.error);
    }, 300000);

    // Run initial checks
    await this.checkVehicleDwell();
    await this.checkPerishableDwell();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new Pool({ connectionString: process.env['DB_WRITE_URL'] });
  const sqsClient = new SQSClient({});
  const worker = new DwellTimerWorker(db, sqsClient);

  worker.start().catch((error) => {
    console.error('Failed to start dwell timer worker:', error);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down dwell timer worker...');
    await db.end();
    sqsClient.destroy();
    process.exit(0);
  });
}
