-- scripts/reset-staging.sql
-- Drops and recreates the staging database.
-- NOTE: This should be executed against the 'postgres' default database.

-- 1. Terminate active connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'wms_db' AND pid <> pg_backend_pid();

-- 2. Drop and recreate
DROP DATABASE IF EXISTS wms_db;
CREATE DATABASE wms_db;

-- 3. Ensure extensions are ready
\c wms_db
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
