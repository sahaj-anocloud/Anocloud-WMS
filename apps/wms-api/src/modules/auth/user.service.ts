/**
 * UserService — manages WMS users, profiles, and role assignments.
 *
 * In production this would integrate with Keycloak/LDAP.
 * For Phase 1, users are stored in user_profiles + user_roles tables
 * and authenticated via the JWT login endpoint.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

// ─── All valid WMS roles ──────────────────────────────────────────────────────

export const ALL_ROLES = [
  'Admin_User',
  'Inbound_Supervisor',
  'Dock_Manager',
  'QC_Associate',
  'WH_Associate',
  'Finance_User',
  'Inventory_Controller',
  'BnM_User',
  'Vendor_User',
  'Vendor_Manager',
  'Gate_Staff',
  'Leadership_Analytics_User',
  'DC_Manager',
  'WMS_Admin',
  'SCM_Head',
] as const;

export type WMSRole = (typeof ALL_ROLES)[number];

// ─── Role display config ──────────────────────────────────────────────────────

export const ROLE_CONFIG: Record<WMSRole, { label: string; description: string; color: string }> = {
  Admin_User:                  { label: 'Admin',              description: 'Full system access, configuration',         color: '#00ff88' },
  Inbound_Supervisor:          { label: 'Inbound Supervisor', description: 'Dock ops, QC review, exception management', color: '#3b82f6' },
  Dock_Manager:                { label: 'Dock Manager',       description: 'Dock assignment, yard queue',               color: '#6366f1' },
  QC_Associate:                { label: 'QC Associate',       description: 'Scanning, batch capture, QC pass/fail',     color: '#a78bfa' },
  WH_Associate:                { label: 'WH Associate',       description: 'Gate entry, unloading scans',               color: '#94a3b8' },
  Finance_User:                { label: 'Finance User',       description: 'GST checks, cost holds, GRPO approvals',    color: '#f59e0b' },
  Inventory_Controller:        { label: 'Inventory Ctrl',     description: 'Inventory ledger, SAP reconciliation',      color: '#10b981' },
  BnM_User:                    { label: 'BnM User',           description: 'SKU master, pricing, promo rules',          color: '#ec4899' },
  Vendor_User:                 { label: 'Vendor User',        description: 'ASN submission, appointments, compliance',  color: '#22c55e' },
  Vendor_Manager:              { label: 'Vendor Manager',     description: 'Vendor approval, second-level sign-off',    color: '#84cc16' },
  Gate_Staff:                  { label: 'Gate Staff',         description: 'Vehicle registration, yard queue view',     color: '#64748b' },
  Leadership_Analytics_User:   { label: 'Leadership',         description: 'KPI dashboards, reports, read-only',        color: '#f97316' },
  DC_Manager:                  { label: 'DC Manager',         description: 'DC-level configuration, scan policy',       color: '#0ea5e9' },
  WMS_Admin:                   { label: 'WMS Admin',          description: 'System-wide admin, scan policy override',   color: '#8b5cf6' },
  SCM_Head:                    { label: 'SCM Head',           description: 'Full system access, GKM hard-stop approvals', color: '#00ff88' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  full_name: string;
  email: string;
  phone?: string;
  roles: WMSRole[];
  dc_id: string;
  preferred_language?: string;
}

export interface UserWithRoles {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  preferred_language: string;
  created_at: string;
  roles: WMSRole[];
  dc_id: string;
}

// ─── UserService ──────────────────────────────────────────────────────────────

export class UserService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
  ) {}

  /**
   * Creates a new user profile and assigns roles.
   * Returns the created user with their assigned roles.
   */
  async createUser(input: CreateUserInput, createdBy: string): Promise<UserWithRoles> {
    if (!input.full_name?.trim()) throw new Error('INVALID_INPUT: full_name is required');
    if (!input.email?.trim()) throw new Error('INVALID_INPUT: email is required');
    if (!input.roles?.length) throw new Error('INVALID_INPUT: at least one role is required');

    // Check for duplicate email within DC
    const existing = await this.dbRead.query<{ user_id: string }>(
      `SELECT user_id FROM user_profiles WHERE email = $1`,
      [input.email.toLowerCase().trim()],
    );
    if (existing.rows.length > 0) {
      throw new Error(`DUPLICATE_EMAIL: A user with email ${input.email} already exists`);
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const userId = randomUUID();

      // Insert user profile
      await client.query(
        `INSERT INTO user_profiles (user_id, full_name, email, phone, preferred_language, created_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          userId,
          input.full_name.trim(),
          input.email.toLowerCase().trim(),
          input.phone?.trim() ?? null,
          input.preferred_language ?? 'en',
        ],
      );

      // Assign roles
      for (const roleName of input.roles) {
        // Get or create role_id
        const roleResult = await client.query<{ role_id: string }>(
          `SELECT role_id FROM rbac_roles WHERE role_name = $1`,
          [roleName],
        );

        let roleId: string;
        if (roleResult.rows.length > 0) {
          roleId = roleResult.rows[0]!.role_id;
        } else {
          // Auto-create role if it doesn't exist yet
          const newRole = await client.query<{ role_id: string }>(
            `INSERT INTO rbac_roles (role_name, description) VALUES ($1, $2) RETURNING role_id`,
            [roleName, ROLE_CONFIG[roleName as WMSRole]?.description ?? roleName],
          );
          roleId = newRole.rows[0]!.role_id;
        }

        await client.query(
          `INSERT INTO user_roles (user_id, role_id, dc_id, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [userId, roleId, input.dc_id, createdBy],
        );
      }

      // Audit event
      await client.query(
        `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
         VALUES ($1, 'USER_CREATED', $2, 'admin-portal', $3, $4::jsonb, 'user_onboarding')`,
        [
          input.dc_id,
          createdBy,
          userId,
          JSON.stringify({ full_name: input.full_name, email: input.email, roles: input.roles }),
        ],
      );

      await client.query('COMMIT');

      return {
        user_id: userId,
        full_name: input.full_name.trim(),
        email: input.email.toLowerCase().trim(),
        phone: input.phone?.trim() ?? null,
        preferred_language: input.preferred_language ?? 'en',
        created_at: new Date().toISOString(),
        roles: input.roles,
        dc_id: input.dc_id,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lists all users for a DC with their assigned roles.
   */
  async listUsers(dcId: string): Promise<UserWithRoles[]> {
    const result = await this.dbRead.query<{
      user_id: string;
      full_name: string;
      email: string;
      phone: string | null;
      preferred_language: string;
      created_at: string;
      roles: string;
    }>(
      `SELECT
         up.user_id::text,
         up.full_name,
         up.email,
         up.phone,
         up.preferred_language,
         up.created_at::text,
         COALESCE(
           json_agg(r.role_name ORDER BY r.role_name) FILTER (WHERE r.role_name IS NOT NULL),
           '[]'
         )::text AS roles
       FROM user_profiles up
       LEFT JOIN user_roles ur ON ur.user_id = up.user_id AND ur.dc_id = $1
       LEFT JOIN rbac_roles r ON r.role_id = ur.role_id
       GROUP BY up.user_id, up.full_name, up.email, up.phone, up.preferred_language, up.created_at
       ORDER BY up.created_at DESC`,
      [dcId],
    );

    return result.rows.map((row) => ({
      ...row,
      roles: JSON.parse(row.roles) as WMSRole[],
      dc_id: dcId,
    }));
  }

  /**
   * Updates roles for an existing user (replaces all current roles for the DC).
   */
  async updateUserRoles(userId: string, roles: WMSRole[], dcId: string, updatedBy: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Remove existing roles for this DC
      await client.query(
        `DELETE FROM user_roles WHERE user_id = $1 AND dc_id = $2`,
        [userId, dcId],
      );

      // Assign new roles
      for (const roleName of roles) {
        const roleResult = await client.query<{ role_id: string }>(
          `SELECT role_id FROM rbac_roles WHERE role_name = $1`,
          [roleName],
        );
        if (roleResult.rows.length > 0) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id, dc_id, assigned_by)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [userId, roleResult.rows[0]!.role_id, dcId, updatedBy],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
         VALUES ($1, 'USER_ROLES_UPDATED', $2, 'admin-portal', $3, $4::jsonb, 'role_change')`,
        [dcId, updatedBy, userId, JSON.stringify({ roles })],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Deactivates a user by removing all their roles for the DC.
   * Does not delete the profile (audit trail preservation).
   */
  async deactivateUser(userId: string, dcId: string, deactivatedBy: string): Promise<void> {
    await this.db.query(
      `DELETE FROM user_roles WHERE user_id = $1 AND dc_id = $2`,
      [userId, dcId],
    );
    await this.db.query(
      `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
       VALUES ($1, 'USER_DEACTIVATED', $2, 'admin-portal', $3, '{"deactivated":true}'::jsonb, 'user_offboarding')`,
      [dcId, deactivatedBy, userId],
    );
  }

  /**
   * Updates contact info (email, phone, name) for a user.
   */
  async updateUserProfile(
    userId: string,
    updates: { full_name?: string; email?: string; phone?: string },
    dcId: string,
    updatedBy: string,
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.full_name) { fields.push(`full_name = $${idx++}`); values.push(updates.full_name.trim()); }
    if (updates.email)     { fields.push(`email = $${idx++}`);     values.push(updates.email.toLowerCase().trim()); }
    if (updates.phone)     { fields.push(`phone = $${idx++}`);     values.push(updates.phone.trim()); }

    if (fields.length === 0) return;

    values.push(userId);
    await this.db.query(
      `UPDATE user_profiles SET ${fields.join(', ')} WHERE user_id = $${idx}`,
      values,
    );

    await this.db.query(
      `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
       VALUES ($1, 'USER_PROFILE_UPDATED', $2, 'admin-portal', $3, $4::jsonb, 'profile_update')`,
      [dcId, updatedBy, userId, JSON.stringify(updates)],
    );
  }
}
