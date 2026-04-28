# WMS Modules F–L, Integrations, and Supporting Systems

## Background

Modules A–E are complete. The codebase is a TypeScript/Fastify monorepo (`apps/wms-api`) with PostgreSQL, Redis, SQS, fast-check property tests (vitest), and a well-established pattern: `<module>.service.ts` + `<module>.routes.ts` + `<module>.service.test.ts`. All DB migrations up to V010 already exist. The `shared-types` package, `audit.ts`, `rbac.ts`, and infrastructure plugins (`db`, `redis`, `sqs`) are all in place.

---

## User Review Required

> [!IMPORTANT]
> **Optional tasks (marked `*`)**: Tasks 7.2, 7.3, 8.3 (partially), 9.2, 9.4, 10.2, 10.4, 11.2, 11.4, 12.2, 12.4, 13.2, 13.4, 15.5, 15.6, 18.2–18.4, 19.2 are property/load tests. I'll implement the core mandatory tasks first and include all property tests as well.

> [!WARNING]
> **Scanner App (Module 15)** and **Vendor Portal (Module 16)** are full mobile/web apps. I will implement the backend API endpoints for scanner app sync and vendor portal in the `wms-api`, but will **not** initialise the React Native / Next.js front-ends unless you explicitly request it — that is typically a multi-week effort in its own right. Let me know if you want the front-ends scaffolded.

> [!IMPORTANT]
> **SAP Java/Spring adapters (Task 14.1–14.3)** live in `services/sap-integration`. These would require a full Java/Spring Boot project. I will create stub/mock implementations and the corresponding TypeScript side of the contracts, and note the Java side for a separate work item.

---

## Proposed Changes

### Module F — Barcode / LPN / Relabeling (Task 7)

The `barcodes` module already handles EAN/GS1 lookup. We need an `lpns` module on top.

#### [NEW] `apps/wms-api/src/modules/lpns/lpn.service.ts`
- `generateLPN(dcCode, skuId, batchNumber, expiryDate, location)` — format `{DC_CODE}-{YYYYMMDD}-{8-digit-seq}`, uses a per-DC DB sequence via `SELECT nextval('lpn_seq_{dc_code}')`.
- GS1-128 encoding with AIs: (00) SSCC-18, (01) GTIN-14, (10) Batch, (17) Expiry.
- `printLPN(lpnBarcode, printerHost)` — raw TCP socket to port 9100, ZPL template, 3 s timeout, 1 retry.
- `relabel(scannedBarcode, ...)` — writes new LPN, records reason in `audit_events`.
- `reprint(lpnId, ...)` — flags `is_reprinted = true`, writes audit event.

#### [NEW] `apps/wms-api/src/modules/lpns/lpn.routes.ts`
- `POST /api/v1/lpns/generate` (WH_Associate, Inbound_Supervisor)
- `GET /api/v1/lpns/:barcode`
- `POST /api/v1/lpns/relabel` (WH_Associate, Inbound_Supervisor)
- `POST /api/v1/lpns/:id/reprint` (WH_Associate, Inbound_Supervisor)

#### [NEW] `apps/wms-api/src/modules/lpns/lpn.service.test.ts`
- Unit tests for LPN format, GS1-128 encode/decode.
- Property tests (Props 21 & 22): LPN uniqueness, encode/decode round-trip.

#### [MODIFY] `packages/db-migrations/migrations/V005__module_f_lpns.sql`
- Add per-DC sequence creation helper function / seed sequences for known DC codes.

---

### Module G — Quarantine / Hold / Damage (Task 8)

#### [NEW] `apps/wms-api/src/modules/quarantine/quarantine.service.ts`
- `placeQuarantine(...)` — atomic ledger update (Available→Held), sets `financial_status = 'Held'`, applies BR-14 (perishable → ColdZone), writes `QUARANTINE_PLACED` audit event, blocks picks.
- `resolveQuarantine(id, outcome, ...)` — Accept/Reject/Dispose transitions, writes audit event.
- `getActiveHolds(dcId)` — active holds dashboard.

#### [NEW] `apps/wms-api/src/modules/quarantine/quarantine.routes.ts`
- `POST /api/v1/quarantine` (Inbound_Supervisor)
- `PUT /api/v1/quarantine/:id/resolve` (Inbound_Supervisor)
- `GET /api/v1/quarantine/active`

#### [NEW] `apps/wms-api/src/jobs/quarantine-alert.ts`
- Background worker (15-min interval) — checks holds open > 4 h, publishes `QUARANTINE_OPEN_4H` to SQS.

#### [NEW] `apps/wms-api/src/modules/quarantine/quarantine.service.test.ts`

---

### Module H — Inventory Ledger & Stock States (Task 9)

#### [NEW] `apps/wms-api/src/modules/ledger/ledger.service.ts`
- `updateLedger(dcId, skuId, fromState, toState, quantity, txnType, referenceDoc, performedBy)` — full DB transaction; enforces balance equation; rejects negatives.
- `allocateFT(...)` — 100% equal-share allocation on GRNComplete for FT items.
- `allocateNFT(...)` — demand-proportional allocation; remainder to highest-demand store.
- `reconcileWithSAP(dcId)` — compares `inventory_ledger` Available vs. SAP stock; flags > 0.1% discrepancy.

#### [NEW] `apps/wms-api/src/modules/ledger/ledger.routes.ts`
- `GET /api/v1/reports/reconciliation`

#### [NEW] `apps/wms-api/src/jobs/sap-stock-sync.ts`
- Scheduled every 15 min; calls `GET /internal/sap/stock`; publishes `SAP_SYNC_DISCREPANCY` alert.

#### [NEW] `apps/wms-api/src/modules/ledger/ledger.service.test.ts`
- Unit tests for balance equation, negative-quantity rejection, FT/NFT allocation.
- Property tests (Props 23 & 24): ledger balance invariant, NFT proportionality.

---

### Module I — Alerts / Notifications / Escalations (Task 10)

#### [NEW] `apps/wms-api/src/modules/alerts/alert.service.ts`
- `createAlert(type, severity, dcId, referenceDoc, payload)` — inserts `alerts` + fan-out `alert_deliveries` per target role.
- `acknowledgeAlert(alertId, userId)` — records ack timestamp.
- All ten alert types, severities, target roles, and escalation windows defined as a config map.

#### [NEW] `apps/wms-api/src/modules/alerts/alert.routes.ts`
- `PUT /api/v1/alerts/:id/acknowledge`

#### [NEW] `apps/wms-api/src/jobs/alert-consumer.ts`
- SQS consumer polling Alert-Events queue.
- SNS fan-out: WebSocket (in-app), SMS (SNS), Email (SES).

#### [NEW] `apps/wms-api/src/jobs/escalation-engine.ts`
- 1-min interval; checks unacknowledged deliveries past escalation window; creates new escalation delivery record.

#### [NEW] `apps/wms-api/src/modules/alerts/alert.service.test.ts`
- Property tests (Props 27 & 28): delivery completeness, escalation ordering.

---

### Module J — Reporting / Dashboards / Control Tower (Task 11)

#### [NEW] `apps/wms-api/src/modules/reports/report.service.ts`
- `computeKPIs(dcId)` — queries live tables to compute all nine KPIs; clamps to [0,100]; writes to `kpi_snapshots`.
- `getControlTower(dcId)` — reads latest snapshot (sub-second).
- `getVendorScorecard(vendorId, filters)`.
- `getProductivity(filters)`.
- `enqueueReportExport(type, filters, format)` — SQS job; returns S3 presigned URL.

#### [NEW] `apps/wms-api/src/modules/reports/report.routes.ts`
- `GET /api/v1/reports/control-tower`
- `GET /api/v1/reports/vendor-scorecard/:vendor_id`
- `GET /api/v1/reports/productivity`
- `POST /api/v1/reports/export`

#### [NEW] `apps/wms-api/src/jobs/kpi-snapshot.ts`
- 5-min interval; calls `computeKPIs` for each active DC.

#### [NEW] `apps/wms-api/src/modules/reports/report.service.test.ts`
- Property tests (Props 29 & 30): KPI bounds [0,100], aggregation consistency.

---

### Module K — Audit Trail / Chain of Custody (Task 12)

The `writeAuditEvent` function already exists. We need the chain-of-custody and export APIs.

#### [NEW] `apps/wms-api/src/modules/audit/audit.routes.ts`
- `GET /api/v1/audit/chain-of-custody/:lpn_barcode` — validates complete chain.
- `GET /api/v1/audit/events` — filtered query.
- `POST /api/v1/audit/export` (Admin_User, Finance_User) — async S3 export.

#### [NEW] `apps/wms-api/src/modules/audit/audit.service.ts`
- Query and chain-of-custody validation logic.
- Export serialisation (JSON/CSV).

#### [NEW] `apps/wms-api/src/modules/audit/audit.service.test.ts`
- Property tests (Props 25 & 26): immutability (monotonically non-decreasing count), export round-trip.

---

### Module L — Admin / Configuration Framework (Task 13)

Auth + RBAC are already partially implemented (`auth.ts`, `rbac.ts`). We need the config API.

#### [NEW] `apps/wms-api/src/modules/admin/admin.routes.ts`
- `GET /api/v1/admin/config` (Admin_User)
- `PUT /api/v1/admin/config/:key` (Admin_User) — previous value + reason code in audit event.

#### [NEW] `apps/wms-api/src/modules/admin/admin.service.ts`
- DC-scoped config lookup; injects `dc_id` from JWT.

#### [NEW] `apps/wms-api/src/modules/admin/admin.service.test.ts`
- Property tests (Props 31 & 32): RBAC enforcement, DC isolation.

---

### SAP, Label Printer, and GST/E-Way Bill Integrations (Task 14)

#### [NEW] `apps/wms-api/src/modules/integrations/print.service.ts`
- `PrintService` — raw TCP socket ZPL printing (port 9100, 3 s timeout, 1 retry).

#### [NEW] `apps/wms-api/src/modules/integrations/eway-bill.service.ts`
- `EWayBillService` — calls GSP REST `GET /ewb/v1.03/ewbDtls?ewbNo=`.

#### [NEW] `services/sap-integration/` stub structure
- README describing Java/Spring adapters needed.
- TypeScript contract types for `POSyncAdapter`, `GRPOPostAdapter`, `StockSyncAdapter`.

---

### Scanner App Backend (Task 15)

#### [NEW] `apps/wms-api/src/modules/scanner/scanner.routes.ts`
- `POST /api/v1/scanner/gate-entry`
- `GET /api/v1/scanner/delivery/:id`
- `POST /api/v1/scanner/scan`
- `POST /api/v1/scanner/qc-pass/:line_id`
- `POST /api/v1/scanner/batch-capture`
- `POST /api/v1/scanner/lpn/print`
- `POST /api/v1/scanner/quarantine`
- `POST /api/v1/scanner/offline-sync`

#### [NEW] `apps/wms-api/src/modules/scanner/scanner.service.ts`
- Offline sync: processes transactions in `captured_at ASC` order; conflict detection per 4 rules; returns `{id, status: "applied"}` or `{id, status: "conflict", serverState}`.

#### [NEW] `apps/wms-api/src/modules/scanner/scanner.service.test.ts`
- Property tests (Props 33 & 34): chronological replay, data integrity.

---

### Performance / Load Tests (Task 18)

#### [NEW] `infra/k6/barcode-scan.js`
#### [NEW] `infra/k6/auto-grn.js`
#### [NEW] `infra/k6/dashboard-kpi.js`
#### [NEW] `infra/k6/lpn-print.js`

---

### Security (Task 19)

#### [NEW] `apps/wms-api/src/modules/integrations/device-registry.ts`
- `checkDeviceRegistration(deviceId)` middleware; returns 401 for unregistered devices.

#### [NEW] `apps/wms-api/src/modules/integrations/encryption.service.ts`
- AES-256-GCM field-level encryption for PII (GSTIN, bank details).

---

### `app.ts` — Register All New Routes

#### [MODIFY] `apps/wms-api/src/app.ts`
- Import and register all new route modules.

---

## Open Questions

> [!IMPORTANT]
> **Scanner App (React Native) and Vendor Portal (Next.js) front-ends**: Should I scaffold the full mobile/web apps, or just the WMS Core API backend endpoints they consume?

> [!IMPORTANT]
> **SAP Java/Spring services**: Should I create stub Spring Boot project structure with placeholder implementations, or full Java implementations? (Requires separate Java workspace.)

> [!NOTE]
> **LPN per-DC DB sequences**: The V005 migration doesn't yet create named sequences like `lpn_seq_dc001`. I'll add a V011 migration that creates dynamic sequences. Alternatively I can use an `lpn_counters` table approach that works without migration changes. Prefer the DB sequence approach unless you have a reason to avoid DDL.

---

## Verification Plan

### Automated Tests
- `cd C:\Users\Sahaj Singh\Documents\WMS && npx vitest --run` — all unit + property tests must pass.
- Property tests use `fc.assert(..., { numRuns: 100 })` per spec.

### Manual Verification
- Review generated `lpn.service.ts` GS1-128 encode/decode logic.
- Verify all new routes appear in the route list with correct RBAC guards.
