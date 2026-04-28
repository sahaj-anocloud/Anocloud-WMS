-- V012: Gap #3 — Mixed Expiry Lot Sub-Lines
-- Adds delivery_sub_lines table so a single delivery_line can hold
-- multiple batch/expiry records when a vendor delivers mixed lots
-- (PRD Item 117, Item 237).

CREATE TABLE delivery_sub_lines (
  sub_line_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id         UUID NOT NULL REFERENCES delivery_lines(line_id) ON DELETE CASCADE,
  batch_number    VARCHAR(100) NOT NULL,
  expiry_date     DATE         NOT NULL,
  manufacture_date DATE,                        -- Item 114: optional mfg date
  quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  captured_by     UUID         NOT NULL,
  device_id       VARCHAR(100) NOT NULL,
  captured_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_lines_line_id    ON delivery_sub_lines (line_id);
CREATE INDEX idx_sub_lines_expiry_date ON delivery_sub_lines (expiry_date);

-- Gap #13 — Evidence / Photo Attachments
-- Stores references to uploaded S3 objects for seal photos, damage photos,
-- barcode-mismatch photos (PRD Items 107, 120, BR-16).

CREATE TABLE evidence_attachments (
  attachment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Reference can be any entity: delivery_line, quarantine_record, gate event, etc.
  reference_type  VARCHAR(50)  NOT NULL,   -- 'delivery_line' | 'gate_entry' | 'quarantine' | 'lpn_print'
  reference_id    UUID         NOT NULL,
  attachment_type VARCHAR(50)  NOT NULL,   -- 'seal_photo' | 'damage_photo' | 'barcode_photo' | 'document'
  s3_key          TEXT         NOT NULL,
  s3_bucket       VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER,
  mime_type       VARCHAR(100),
  uploaded_by     UUID         NOT NULL,
  device_id       VARCHAR(100) NOT NULL,
  uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Soft-delete only: floor users cannot hard-delete. Admin action required.
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID
);

CREATE INDEX idx_evidence_reference ON evidence_attachments (reference_type, reference_id);
CREATE INDEX idx_evidence_uploaded_at ON evidence_attachments (uploaded_at);
-- Partial index: active (non-deleted) attachments only
CREATE INDEX idx_evidence_active ON evidence_attachments (reference_type, reference_id)
  WHERE deleted_at IS NULL;
