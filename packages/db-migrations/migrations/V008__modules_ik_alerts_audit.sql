-- V008: Modules I/K — Alerts, Notifications, and Audit Trail
-- Tables: alerts, alert_deliveries, audit_events (TimescaleDB hypertable)

-- ─── Alerts ───────────────────────────────────────────────────────────────────

CREATE TABLE alerts (
  alert_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         VARCHAR(20) NOT NULL,
  alert_type    VARCHAR(100) NOT NULL,
  severity      VARCHAR(10) NOT NULL CHECK (severity IN ('Info','Warning','Critical')),
  reference_doc VARCHAR(100),
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload       JSONB NOT NULL
);

CREATE INDEX idx_alerts_dc_id ON alerts (dc_id);
CREATE INDEX idx_alerts_alert_type ON alerts (alert_type);
CREATE INDEX idx_alerts_severity ON alerts (severity);
CREATE INDEX idx_alerts_triggered_at ON alerts (triggered_at);

-- ─── Alert Deliveries ─────────────────────────────────────────────────────────

CREATE TABLE alert_deliveries (
  delivery_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        UUID NOT NULL REFERENCES alerts(alert_id),
  target_user_id  UUID NOT NULL,
  channel         VARCHAR(20) NOT NULL CHECK (channel IN ('InApp','SMS','Email')),
  sent_at         TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  escalated_at    TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Sent','Acknowledged','Escalated','Failed'))
);

CREATE INDEX idx_alert_deliveries_alert_id ON alert_deliveries (alert_id);
CREATE INDEX idx_alert_deliveries_target_user_id ON alert_deliveries (target_user_id);
CREATE INDEX idx_alert_deliveries_status ON alert_deliveries (status);

-- ─── Audit Events (TimescaleDB hypertable) ────────────────────────────────────
-- Append-only audit log with 7-year retention and 90-day compression
-- Application DB role must have INSERT-only access (no UPDATE or DELETE)

CREATE TABLE audit_events (
  event_id       UUID NOT NULL DEFAULT gen_random_uuid(),
  dc_id          VARCHAR(20) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  user_id        UUID NOT NULL,
  device_id      VARCHAR(100) NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference_doc  VARCHAR(100),
  previous_state JSONB,
  new_state      JSONB,
  reason_code    VARCHAR(200),
  PRIMARY KEY (event_id, occurred_at)
);

-- Convert to TimescaleDB hypertable (1-month chunks)
SELECT create_hypertable('audit_events', 'occurred_at', chunk_time_interval => INTERVAL '1 month');

-- Enable compression
ALTER TABLE audit_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'dc_id'
);

-- Compress chunks older than 90 days (makes historical data read-only)
SELECT add_compression_policy('audit_events', INTERVAL '90 days');

-- Retain data for 7 years (GST and FSSAI compliance requirement — Req 16.3)
SELECT add_retention_policy('audit_events', INTERVAL '7 years');

CREATE INDEX idx_audit_events_dc_id ON audit_events (dc_id, occurred_at DESC);
CREATE INDEX idx_audit_events_user_id ON audit_events (user_id, occurred_at DESC);
CREATE INDEX idx_audit_events_reference_doc ON audit_events (reference_doc, occurred_at DESC);
CREATE INDEX idx_audit_events_event_type ON audit_events (event_type, occurred_at DESC);
