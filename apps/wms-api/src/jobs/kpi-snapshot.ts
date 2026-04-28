import type { Pool } from 'pg';
import { ReportService } from '../modules/reports/report.service.js';

/**
 * Background worker: pre-aggregates all nine KPIs every 5 minutes
 * into kpi_snapshots table, enabling sub-second dashboard load times.
 * Req 18.1, 18.2
 */
export function startKPISnapshotJob(fastify: { db: Pool; dbRead: Pool }): NodeJS.Timeout {
  const svc = new ReportService(fastify.db, fastify.dbRead);
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  const run = async () => {
    try {
      // Discover all active DCs from snapshots or vendors
      const dcResult = await fastify.dbRead.query<{ dc_id: string }>(
        `SELECT DISTINCT dc_id FROM vendors WHERE compliance_status = 'Active'
         UNION
         SELECT DISTINCT dc_id FROM deliveries WHERE created_at > now() - INTERVAL '7 days'`,
      );

      for (const row of dcResult.rows) {
        try {
          await svc.computeAndStoreKPIs(row.dc_id);
        } catch (err) {
          console.error(`[kpi-snapshot] Failed to compute KPIs for DC ${row.dc_id}:`, err);
        }
      }
    } catch (err) {
      console.error('[kpi-snapshot] Error fetching active DCs:', err);
    }
  };

  void run();
  return setInterval(run, INTERVAL_MS);
}
