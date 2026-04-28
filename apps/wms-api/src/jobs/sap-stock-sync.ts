import type { Pool } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { LedgerService } from '../modules/ledger/ledger.service.js';

/**
 * Background worker: fetches SAP stock every 15 minutes, compares with WMS
 * inventory_ledger Available quantities, and publishes SAP_SYNC_DISCREPANCY
 * alerts for variances > 0.1%.
 * Req 15.7, 15.8
 */
export function startSAPStockSyncJob(db: Pool, sqsClient: SQSClient): NodeJS.Timeout {
  const svc = new LedgerService(db, sqsClient);
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  const run = async () => {
    try {
      // Fetch all active DC IDs
      const dcResult = await db.query<{ dc_id: string }>(
        `SELECT DISTINCT dc_id FROM inventory_ledger WHERE quantity > 0`,
      );

      for (const row of dcResult.rows) {
        await svc.reconcileWithSAP(row.dc_id);
      }
    } catch (err) {
      console.error('[sap-stock-sync] Error during SAP reconciliation:', err);
    }
  };

  void run();
  return setInterval(run, INTERVAL_MS);
}
