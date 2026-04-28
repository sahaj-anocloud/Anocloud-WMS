-- V020: Add timestamps to delivery_lines for productivity tracking
ALTER TABLE delivery_lines ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE delivery_lines ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Update existing records to have a reasonable updated_at if they were completed
UPDATE delivery_lines SET updated_at = now() WHERE qc_status = 'Passed';
