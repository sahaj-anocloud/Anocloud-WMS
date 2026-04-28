import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { ReportService } from './report.service.js';

/** Zero-value KPI snapshot returned when DB is unavailable (dev / cold start). */
function fallbackKPI(dcId: string) {
  return {
    dc_id: dcId,
    asn_coverage_rate: 0,
    gate_to_grn_time_avg_min: null,
    perishable_dwell_avg_min: null,
    receipt_first_pass_yield: 0,
    barcode_remediation_rate: 0,
    scanning_compliance_rate: 0,
    batch_capture_rate: 0,
    inventory_accuracy_rate: 0,
    vendor_compliance_rate: 0,
    total_deliveries: 0,
    total_asns: 0,
    snapshot_at: new Date().toISOString(),
    _fallback: true,
  };
}

export default async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new ReportService(fastify.db, fastify.dbRead);

  // GET /api/v1/reports/control-tower — sub-second KPI dashboard. Req 18.2
  fastify.get(
    '/api/v1/reports/control-tower',
    { preHandler: requireRole('Inbound_Supervisor', 'Admin_User', 'Leadership_Analytics_User', 'Finance_User', 'Inventory_Controller') },
    async (request, reply) => {
      try {
        const snapshot = await svc.getControlTower(request.user.dc_id);
        if (!snapshot) {
          // KPI worker hasn't run yet — return a zero-value baseline so dashboard renders
          return reply.code(200).send(fallbackKPI(request.user.dc_id));
        }
        return reply.code(200).send(snapshot);
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'control-tower DB query failed — returning fallback KPI');
        return reply.code(200).send(fallbackKPI(request.user.dc_id));
      }
    },
  );

  // GET /api/v1/reports/vendor-scorecard/:vendor_id — per-vendor metrics. Req 18.3
  fastify.get(
    '/api/v1/reports/vendor-scorecard/:vendor_id',
    { preHandler: requireRole('Admin_User', 'Leadership_Analytics_User', 'Finance_User', 'Inventory_Controller') },
    async (request, reply) => {
      const { vendor_id } = request.params as { vendor_id: string };
      const query = request.query as { from_date?: string; to_date?: string };

      try {
        const scorecard = await svc.getVendorScorecard(vendor_id, request.user.dc_id, {
          ...(query.from_date && { fromDate: query.from_date }),
          ...(query.to_date && { toDate: query.to_date }),
        });
        return reply.code(200).send(scorecard);
      } catch (err: unknown) {
        if (err instanceof Error && (err as { code?: string }).code === 'VENDOR_NOT_FOUND') {
          return reply.code(404).send({ error: 'VENDOR_NOT_FOUND' });
        }
        throw err;
      }
    },
  );

  // GET /api/v1/reports/productivity — scanner productivity dashboard. Req 18.4
  fastify.get(
    '/api/v1/reports/productivity',
    { preHandler: requireRole('Admin_User', 'Leadership_Analytics_User', 'Inbound_Supervisor') },
    async (request, reply) => {
      const query = request.query as {
        from_date?: string;
        to_date?: string;
        user_id?: string;
      };

      const rows = await svc.getProductivity(request.user.dc_id, {
        ...(query.from_date && { fromDate: query.from_date }),
        ...(query.to_date && { toDate: query.to_date }),
        ...(query.user_id && { userId: query.user_id }),
      });

      return reply.code(200).send(rows);
    },
  );

  // GET /api/v1/reports/reconciliation — WMS vs SAP quantities per SKU. Req 15.7, 15.8
  fastify.get(
    '/api/v1/reports/reconciliation',
    { preHandler: requireRole('Inventory_Controller', 'Finance_User', 'Admin_User') },
    async (request, reply) => {
      // The most recent reconciliation is stored in the sap_reconciliation_log view.
      // For now, return the latest SAP sync results from alerts.
      const result = await fastify.db.query(
        `SELECT a.payload, a.triggered_at
         FROM alerts a
         WHERE a.dc_id = $1 AND a.alert_type = 'SAP_SYNC_DISCREPANCY'
         ORDER BY a.triggered_at DESC LIMIT 100`,
        [request.user.dc_id],
      );
      return reply.code(200).send(result.rows);
    },
  );

  // POST /api/v1/reports/export — async export to CSV/PDF. Req 18.6
  fastify.post(
    '/api/v1/reports/export',
    { preHandler: requireRole('Admin_User', 'Finance_User', 'Leadership_Analytics_User') },
    async (request, reply) => {
      const body = request.body as {
        report_type: string;
        filters?: Record<string, unknown>;
        format: 'CSV' | 'PDF';
      };

      const result = await svc.enqueueExport(
        body.report_type,
        body.filters ?? {},
        body.format,
        request.user.user_id,
      );

      return reply.code(202).send(result);
    },
  );
}
