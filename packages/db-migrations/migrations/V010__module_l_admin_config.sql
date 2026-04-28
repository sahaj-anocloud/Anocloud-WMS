-- V010: Module L — Admin / Configuration Framework
-- Tables: system_config, rbac_roles, rbac_permissions, user_roles

-- ─── System Config ────────────────────────────────────────────────────────────
-- Configurable parameters per DC — no code deployment required (Req 19.3)

CREATE TABLE system_config (
  config_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id       VARCHAR(20) NOT NULL,
  param_key   VARCHAR(100) NOT NULL,
  param_value TEXT NOT NULL,
  updated_by  UUID NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason_code VARCHAR(200) NOT NULL,
  UNIQUE (dc_id, param_key)
);

CREATE INDEX idx_system_config_dc_id ON system_config (dc_id);
CREATE INDEX idx_system_config_param_key ON system_config (param_key);

-- ─── RBAC Roles ───────────────────────────────────────────────────────────────
-- Roles: WH_Associate, QC_Associate, Inbound_Supervisor, Inventory_Controller,
--        BnM_User, Finance_User, Vendor_User, Dock_Manager, Admin_User,
--        Leadership_Analytics_User (Req 19.1)

CREATE TABLE rbac_roles (
  role_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name   VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rbac_roles_role_name ON rbac_roles (role_name);

-- ─── RBAC Permissions ─────────────────────────────────────────────────────────

CREATE TABLE rbac_permissions (
  permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID NOT NULL REFERENCES rbac_roles(role_id),
  resource      VARCHAR(100) NOT NULL,  -- e.g. 'vendors', 'deliveries', 'gkm_checks'
  action        VARCHAR(50) NOT NULL,   -- e.g. 'read', 'create', 'approve', 'export'
  dc_id         VARCHAR(20),            -- NULL = applies to all DCs
  UNIQUE (role_id, resource, action, dc_id)
);

CREATE INDEX idx_rbac_permissions_role_id ON rbac_permissions (role_id);
CREATE INDEX idx_rbac_permissions_resource ON rbac_permissions (resource);

-- ─── User Roles ───────────────────────────────────────────────────────────────

CREATE TABLE user_roles (
  user_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  role_id      UUID NOT NULL REFERENCES rbac_roles(role_id),
  dc_id        VARCHAR(20) NOT NULL,
  assigned_by  UUID NOT NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, dc_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);
CREATE INDEX idx_user_roles_dc_id ON user_roles (dc_id);

-- ─── Seed default roles ───────────────────────────────────────────────────────

INSERT INTO rbac_roles (role_name, description) VALUES
  ('WH_Associate',              'Warehouse Associate — gate entry, unloading scans'),
  ('QC_Associate',              'QC Associate — QC scanning, batch capture'),
  ('Inbound_Supervisor',        'Inbound Supervisor — GKM soft-stop approval, quarantine placement'),
  ('Inventory_Controller',      'Inventory Controller — ledger management, SAP reconciliation'),
  ('BnM_User',                  'Buying and Merchandising — SKU management, price alerts'),
  ('Finance_User',              'Finance User — GST resolution, GKM hard-stop alerts'),
  ('Vendor_User',               'Vendor — ASN submission, appointment requests'),
  ('Dock_Manager',              'Dock Manager — yard queue, dock assignment'),
  ('Admin_User',                'System Administrator — RBAC, master data, system config'),
  ('Leadership_Analytics_User', 'Leadership / Analytics — dashboards, report export');
