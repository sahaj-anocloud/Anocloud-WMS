-- ─── DB Roles and Permissions ───────────────────────────────────────────────────
-- Req 19.4, 19.5, 20.8

-- 1. Create a READ-ONLY role for reports and analytical queries
CREATE ROLE wms_read_only;
GRANT USAGE ON SCHEMA public TO wms_read_only;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO wms_read_only;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO wms_read_only;

-- 2. Create an INSERT-ONLY role for audit logs
-- This role can ONLY insert into audit_events and scan_events
CREATE ROLE wms_audit_append;
GRANT USAGE ON SCHEMA public TO wms_audit_append;
GRANT INSERT ON public.audit_events TO wms_audit_append;
GRANT INSERT ON public.scan_events TO wms_audit_append;
-- Explicitly deny SELECT/UPDATE/DELETE to prevent tampering
REVOKE ALL PRIVILEGES ON public.audit_events FROM wms_audit_append;
GRANT INSERT ON public.audit_events TO wms_audit_append;

-- 3. App role for core business logic
CREATE ROLE wms_app_user;
GRANT USAGE ON SCHEMA public TO wms_app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO wms_app_user;
-- Deny DELETE on core tables (soft deletes only)
REVOKE DELETE ON public.inventory_ledger FROM wms_app_user;
REVOKE DELETE ON public.deliveries FROM wms_app_user;
