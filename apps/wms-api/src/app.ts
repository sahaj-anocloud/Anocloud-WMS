import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';

import dbPlugin from './plugins/db.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import auditPlugin from './plugins/audit.js';
import sqsPlugin from './plugins/sqs.js';
import s3Plugin from './plugins/s3.js';

import healthRoutes from './routes/health.js';
import asnRoutes from './modules/asns/asn.routes.js';
import appointmentRoutes from './modules/appointments/appointment.routes.js';
import gateRoutes from './modules/gate/gate.routes.js';
import receivingRoutes from './modules/receiving/receiving.routes.js';
import lpnRoutes from './modules/lpns/lpn.routes.js';
import quarantineRoutes from './modules/quarantine/quarantine.routes.js';
import ledgerRoutes from './modules/ledger/ledger.routes.js';
import alertRoutes from './modules/alerts/alert.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import scannerRoutes from './modules/scanner/scanner.routes.js';
import evidenceRoutes from './modules/evidence/evidence.routes.js';
import { gkmRoutes } from './modules/gkm/gkm.routes.js';
import { gstRoutes } from './modules/gst/gst.routes.js';
import { promoRoutes } from './modules/promo/promo.routes.js';
import { grnRoutes } from './modules/grn/grn.routes.js';
import authLoginRoutes from './modules/auth/auth.routes.js';
import vendorRoutes from './modules/vendors/vendor.routes.js';
import skuRoutes from './modules/skus/sku.routes.js';

import { startQuarantineAlertJob } from './jobs/quarantine-alert.js';
import { startSAPStockSyncJob } from './jobs/sap-stock-sync.js';
import { startKPISnapshotJob } from './jobs/kpi-snapshot.js';
import { startEscalationEngine } from './jobs/escalation-engine.js';
import { startAuditArchiveJob } from './jobs/audit-archive.js';

import fs from 'fs';
import path from 'path';

export async function buildApp() {
  const isProd = process.env['NODE_ENV'] === 'production';
  const fastifyOptions: any = {
    logger: true,
  };

  // Task 19: Security hardening - TLS 1.2+ enforcement
  if (isProd && process.env['USE_HTTPS'] === 'true') {
    fastifyOptions.https = {
      // In production, these should be real paths to certificates
      // key: fs.readFileSync(path.join(__dirname, '../certs/server.key')),
      // cert: fs.readFileSync(path.join(__dirname, '../certs/server.crt')),
      secureProtocol: 'TLSv1_2_method',
      ciphers: [
        "ECDHE-RSA-AES128-GCM-SHA256",
        "ECDHE-ECDSA-AES128-GCM-SHA256",
        "ECDHE-RSA-AES256-GCM-SHA384",
        "ECDHE-ECDSA-AES256-GCM-SHA384",
        "HIGH",
        "!aNULL",
        "!eNULL",
        "!EXPORT",
        "!DES",
        "!RC4",
        "!MD5",
        "!PSK",
        "!SRP",
        "!CAMELLIA"
      ].join(':'),
      honorCipherOrder: true,
      minVersion: 'TLSv1.2'
    };
  }

  const fastify = Fastify(fastifyOptions);

  // Core plugins
  await fastify.register(cors);
  await fastify.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await fastify.register(helmet);

  // Infrastructure plugins
  await fastify.register(dbPlugin);
  await fastify.register(redisPlugin);
  await fastify.register(authPlugin);
  await fastify.register(auditPlugin);
  await fastify.register(sqsPlugin);
  await fastify.register(s3Plugin);

  // Routes
  await fastify.register(healthRoutes);
  await fastify.register(authLoginRoutes); // POST /api/v1/auth/login
  await fastify.register(asnRoutes);
  await fastify.register(appointmentRoutes);
  await fastify.register(gateRoutes);
  await fastify.register(receivingRoutes);

  // --- Register Modules ---
  await fastify.register(lpnRoutes);
  await fastify.register(quarantineRoutes);
  await fastify.register(ledgerRoutes);
  await fastify.register(alertRoutes);
  await fastify.register(reportRoutes);
  await fastify.register(auditRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(scannerRoutes);
  await fastify.register(evidenceRoutes);
  await fastify.register(gkmRoutes, { prefix: '/api/v1/gkm' });
  await fastify.register(gstRoutes, { prefix: '/api/v1/gst' });
  await fastify.register(promoRoutes, { prefix: '/api/v1/promo' });
  await fastify.register(grnRoutes, { prefix: '/api/v1/grn' });
  await fastify.register(vendorRoutes);
  await fastify.register(skuRoutes);

  // Background Workers
  startQuarantineAlertJob(fastify.db, fastify.sqsClient);
  startSAPStockSyncJob(fastify.db, fastify.sqsClient);
  startKPISnapshotJob({ db: fastify.db, dbRead: fastify.dbRead });
  startEscalationEngine(fastify.db, fastify.sqsClient);
  startAuditArchiveJob(fastify.db);

  return fastify;
}
