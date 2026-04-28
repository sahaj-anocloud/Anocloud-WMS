import type { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { AlertService } from '../modules/alerts/alert.service.js';

/**
 * Background worker: runs escalation check every 1 minute.
 * Escalates unacknowledged alerts past their escalation window.
 * Creates new alert_deliveries records for escalation targets.
 * Req 17.4, 17.5
 */
export function startEscalationEngine(db: Pool, sqsClient: SQSClient): NodeJS.Timeout {
  const svc = new AlertService(db, sqsClient);
  const INTERVAL_MS = 60 * 1000; // 1 minute

  const run = async () => {
    try {
      await svc.runEscalations();

      // New rollup tasks
      const dcs = await db.query<{ dc_id: string }>('SELECT DISTINCT dc_id FROM yard_entries');
      for (const { dc_id } of dcs.rows) {
        await svc.runVendorPerformanceRollup(dc_id);
        await svc.runProductivityAlerts(dc_id);
      }

      await svc.processDeliveries();
    } catch (err) {
      console.error('[escalation-engine] Error running tasks:', err);
    }
  };

  void run();
  return setInterval(run, INTERVAL_MS);
}
