-- V011: Module F — Per-DC LPN Sequences
-- Creates named PostgreSQL sequences for LPN generation.
-- Each DC gets its own sequence to guarantee uniqueness per DC
-- under concurrent generation (Req 13.1, 13.3).
--
-- Format: {DC_CODE}-{YYYYMMDD}-{8-digit-zero-padded-sequence}
-- Example: DC001-20260422-00000001
--
-- New DCs can be added by calling:
--   SELECT create_lpn_sequence('NEWDC');

CREATE OR REPLACE FUNCTION create_lpn_sequence(p_dc_code TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS lpn_seq_%s START 1 INCREMENT 1 NO CYCLE',
    lower(regexp_replace(p_dc_code, '[^a-zA-Z0-9]', '_', 'g'))
  );
END;
$$ LANGUAGE plpgsql;

-- Seed sequences for known DC codes (extend as DCs are onboarded)
SELECT create_lpn_sequence('DC001');
SELECT create_lpn_sequence('DC002');
SELECT create_lpn_sequence('DC003');
SELECT create_lpn_sequence('MUM001');
SELECT create_lpn_sequence('DEL001');
SELECT create_lpn_sequence('BLR001');
SELECT create_lpn_sequence('HYD001');
SELECT create_lpn_sequence('CHE001');

-- Relabeling tracking — stores original barcode → new LPN metadata
-- (Req 13.2, 13.6, 13.7 — supplements audit_events)
CREATE TABLE IF NOT EXISTS relabel_events (
  relabel_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id           VARCHAR(20) NOT NULL,
  original_barcode VARCHAR(200) NOT NULL,
  new_lpn_id      UUID NOT NULL REFERENCES lpns(lpn_id),
  reason          TEXT NOT NULL,
  performed_by    UUID NOT NULL,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_relabel_events_dc_id ON relabel_events (dc_id);
CREATE INDEX idx_relabel_events_original_barcode ON relabel_events (original_barcode);
CREATE INDEX idx_relabel_events_new_lpn_id ON relabel_events (new_lpn_id);
