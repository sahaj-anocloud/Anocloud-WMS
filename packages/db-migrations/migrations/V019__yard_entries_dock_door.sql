-- V019: Add dock_door column to yard_entries so dock assignment is stored directly
-- Previously dock_door was only on appointments, causing NULL when no appointment linked

ALTER TABLE yard_entries
  ADD COLUMN IF NOT EXISTS dock_door TEXT;
