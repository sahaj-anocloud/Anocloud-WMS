/**
 * Integration tests for new risk-based-scanning-policy API routes.
 * Task 7.1 — Validates route-level behaviour: role enforcement, request wiring,
 * and response shapes.
 *
 * Tests use Fastify's built-in `inject` helper so no real HTTP server is needed.
 * The database and SQS client are stubbed via vi.mock so no real DB is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { WMSUser } from '../../../plugins/auth.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the device-registry check so it doesn't block requests in tests
vi.mock('../../../modules/integrations/device-registry.js', () => ({
  checkDeviceRegistration: async () => {},
}));

// Mock the audit plugin (writeAuditEvent) to avoid DB calls
vi.mock('../../../plugins/audit.js', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a minimal Fastify app with the receiving and admin routes registered,
 * and decorates `request.user` with the provided WMSUser so we can test RBAC
 * without a real JWT.
 */
async function buildTestApp(user: WMSUser): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Decorate fastify with stub db and sqsClient
  const stubQuery = vi.fn();
  const stubDb = { query: stubQuery } as any;
  app.decorate('db', stubDb);
  app.decorate('dbRead', stubDb);
  app.decorate('sqsClient', { send: vi.fn().mockResolvedValue({}) } as any);

  // Inject user into every request (bypasses JWT verification)
  app.addHook('onRequest', async (request) => {
    (request as any).user = user;
  });

  // Register routes under test
  const { default: receivingRoutes } = await import('../../receiving/receiving.routes.js');
  const { default: adminRoutes } = await import('../../admin/admin.routes.js');
  await app.register(receivingRoutes);
  await app.register(adminRoutes);

  return app;
}

// ─── Role fixtures ────────────────────────────────────────────────────────────

const supervisorUser: WMSUser = {
  user_id: 'sup-1',
  roles: ['Inbound_Supervisor'],
  dc_id: 'dc-1',
};

const qcWorkerUser: WMSUser = {
  user_id: 'qc-1',
  roles: ['QC_Worker'],
  dc_id: 'dc-1',
};

const wmsAdminUser: WMSUser = {
  user_id: 'admin-1',
  roles: ['WMS_Admin'],
  dc_id: 'dc-1',
};

const dcManagerUser: WMSUser = {
  user_id: 'mgr-1',
  roles: ['DC_Manager'],
  dc_id: 'dc-1',
};

const unauthorisedUser: WMSUser = {
  user_id: 'unauth-1',
  roles: ['QC_Worker'],
  dc_id: 'dc-1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/packaging-classes', () => {
  it('returns exactly 6 items with all required PolicyResult fields', async () => {
    const app = await buildTestApp(wmsAdminUser);

    // loadPolicyConfig will query system_config — return empty rows so default config is used
    (app.db as any).query.mockResolvedValue({ rows: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/packaging-classes',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<any[]>();
    expect(body).toHaveLength(6);

    const requiredFields = [
      'packaging_class',
      'base_scan_count',
      'sampling_modifier',
      'asn_confidence_multiplier',
      'required_scans',
      'physical_count_required',
      'label_affixing_required',
      'cold_routing_required',
      'packaging_integrity_preserve',
      'mixed_load_supervisor_review',
    ];

    for (const item of body) {
      for (const field of requiredFields) {
        expect(item, `field "${field}" missing from item`).toHaveProperty(field);
      }
    }
  });

  it('returns 403 for a user without WMS_Admin, DC_Manager, or Inbound_Supervisor role', async () => {
    const app = await buildTestApp({ user_id: 'x', roles: ['QC_Worker'], dc_id: 'dc-1' });
    (app.db as any).query.mockResolvedValue({ rows: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/packaging-classes',
    });

    expect(response.statusCode).toBe(403);
  });

  it('is accessible to Inbound_Supervisor', async () => {
    const app = await buildTestApp(supervisorUser);
    (app.db as any).query.mockResolvedValue({ rows: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/packaging-classes',
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('PUT /api/v1/admin/scan-policy + GET /api/v1/admin/scan-policy round-trip', () => {
  it('stores the policy on PUT and returns identical values on subsequent GET', async () => {
    const app = await buildTestApp(wmsAdminUser);

    const policy = {
      packaging_classes: {
        SealedCarton: { base_formula: 'MAX(1, CEIL(batch_size * 0.05))', physical_count_required: false, label_affixing_required: false, packaging_integrity_preserve: false },
        GunnyBag: { base_formula: '1', physical_count_required: true, label_affixing_required: false, packaging_integrity_preserve: false },
        Rice: { base_formula: '1', physical_count_required: false, label_affixing_required: true, packaging_integrity_preserve: false },
        ShrinkWrap: { base_formula: 'batch_size', physical_count_required: false, label_affixing_required: false, packaging_integrity_preserve: true },
        Loose: { base_formula: 'batch_size + 1', physical_count_required: false, label_affixing_required: false, packaging_integrity_preserve: false },
        MixedLoad: { base_formula: 'MAX(1, CEIL(batch_size * 0.05))', physical_count_required: false, label_affixing_required: false, packaging_integrity_preserve: false },
      },
      low_confidence_threshold: 60,
      low_confidence_multiplier: 1.5,
    };

    // Stub DB for PUT: getParam returns empty, upsert returns a config row, audit insert succeeds
    const serialised = JSON.stringify(policy);
    (app.db as any).query
      .mockResolvedValueOnce({ rows: [] })                                          // getParam (prev value)
      .mockResolvedValueOnce({ rows: [{ config_id: 'c1', dc_id: 'dc-1', param_key: 'packaging_class_scan_policy', param_value: serialised, updated_by: 'admin-1', updated_at: new Date().toISOString(), reason_code: 'test' }] }) // upsert
      .mockResolvedValueOnce({ rows: [] });                                          // audit event insert

    const putResponse = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/scan-policy',
      headers: { 'content-type': 'application/json' },
      payload: { policy, reason_code: 'test-update' },
    });

    expect(putResponse.statusCode).toBe(200);
    const putBody = putResponse.json();
    expect(putBody).toMatchObject(policy);

    // Stub DB for GET: return the serialised policy
    (app.db as any).query.mockResolvedValueOnce({
      rows: [{ param_value: serialised }],
    });

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/scan-policy',
    });

    expect(getResponse.statusCode).toBe(200);
    const getBody = getResponse.json();
    expect(getBody).toMatchObject(policy);
  });

  it('returns 403 for a user without WMS_Admin or DC_Manager role', async () => {
    const app = await buildTestApp(qcWorkerUser);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/scan-policy',
      headers: { 'content-type': 'application/json' },
      payload: { policy: {}, reason_code: 'test' },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('PUT /api/v1/receiving/lines/:id/override', () => {
  it('returns 403 when the JWT user does not have Inbound_Supervisor role', async () => {
    // QC_Worker does not have Inbound_Supervisor — requireRole should reject at preHandler
    const app = await buildTestApp(qcWorkerUser);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/receiving/lines/line-abc/override',
      headers: { 'content-type': 'application/json' },
      payload: { reason_code: 'some reason' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 200 with audit_event_id when Inbound_Supervisor submits a valid override', async () => {
    const app = await buildTestApp(supervisorUser);

    // supervisorOverride uses db.connect() for a transaction, so we need to mock the client
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)                                          // BEGIN
        .mockResolvedValueOnce({ rows: [{ completed_scans: 2, required_scans: 5 }] }) // SELECT line
        .mockResolvedValueOnce({ rows: [] })                                        // UPDATE override_applied
        .mockResolvedValueOnce({ rows: [{ event_id: 'evt-123' }] })                 // INSERT audit_events
        .mockResolvedValueOnce(undefined),                                          // COMMIT
      release: vi.fn(),
    };
    (app.db as any).connect = vi.fn().mockResolvedValue(mockClient);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/receiving/lines/line-abc/override',
      headers: { 'content-type': 'application/json', 'x-device-id': 'device-1' },
      payload: { reason_code: 'Time-critical delivery' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.audit_event_id).toBe('evt-123');
  });
});

describe('GET /api/v1/receiving/compliance', () => {
  it('returns 403 when the JWT user only has QC_Worker role', async () => {
    const app = await buildTestApp(qcWorkerUser);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/receiving/compliance',
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 200 with compliance rows for Inbound_Supervisor', async () => {
    const app = await buildTestApp(supervisorUser);

    const mockRows = [
      { vendor_id: 'v1', vendor_name: 'Vendor A', delivery_count: 10, override_count: 2, avg_scan_compliance_pct: 95 },
    ];
    (app.db as any).query.mockResolvedValueOnce({ rows: mockRows });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/receiving/compliance?from_date=2024-01-01&to_date=2024-12-31',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<any[]>();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ vendor_id: 'v1', vendor_name: 'Vendor A' });
  });

  it('returns 200 for DC_Manager', async () => {
    const app = await buildTestApp(dcManagerUser);
    (app.db as any).query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/receiving/compliance',
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns 200 for WMS_Admin', async () => {
    const app = await buildTestApp(wmsAdminUser);
    (app.db as any).query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/receiving/compliance',
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET /api/v1/receiving/lines/:id/policy', () => {
  it('returns 403 for a user without QC_Worker or Inbound_Supervisor role', async () => {
    const app = await buildTestApp({ user_id: 'x', roles: ['DC_Manager'], dc_id: 'dc-1' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/receiving/lines/line-1/policy',
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('PUT /api/v1/receiving/lines/:id/count', () => {
  it('returns 403 for a user without QC_Worker or Inbound_Supervisor role', async () => {
    const app = await buildTestApp({ user_id: 'x', roles: ['DC_Manager'], dc_id: 'dc-1' });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/receiving/lines/line-1/count',
      headers: { 'content-type': 'application/json' },
      payload: { count_type: 'physical_count', count_value: 10 },
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 200 with { success: true } for QC_Worker', async () => {
    const app = await buildTestApp(qcWorkerUser);
    (app.db as any).query.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/receiving/lines/line-1/count',
      headers: { 'content-type': 'application/json' },
      payload: { count_type: 'physical_count', count_value: 42 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});
