import type { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { QuarantineService } from '../modules/quarantine/quarantine.service.js';

/**
 * Background worker: checks quarantine_records every 15 minutes
 * for holds open > 4 hours without resolution.
 * Publishes QUARANTINE_OPEN_4H event to SQS Alert-Events queue.
 * Targets Inbound_Supervisor and Finance_User.
 * Req 14.8
 */
export function startQuarantineAlertJob(db: Pool, sqsClient: SQSClient): NodeJS.Timeout {
  const svc = new QuarantineService(db, sqsClient);
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  const run = async () => {
    try {
      await svc.checkAndAlertOpenHolds();
    } catch (err) {
      console.error('[quarantine-alert] Error checking open holds:', err);
    }
  };

  // Run immediately on startup, then every 15 minutes
  void run();
  return setInterval(run, INTERVAL_MS);
}
