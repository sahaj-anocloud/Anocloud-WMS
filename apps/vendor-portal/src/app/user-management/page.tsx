'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleMeta {
  role_name: string;
  label: string;
  description: string;
  color: string;
}

interface WMSUser {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  preferred_language: string;
  created_at: string;
  roles: string[];
  dc_id: string;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role, meta }: { role: string; meta?: RoleMeta }) {
  const color = meta?.color ?? '#94a3b8';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold border"
      style={{
        color,
        borderColor: `${color}30`,
        background: `${color}12`,
      }}
    >
      {meta?.label ?? role}
    </span>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleMeta[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    preferred_language: 'en',
    dc_id: 'DC-BLR-01',
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email) {
      addNotification('Name and email are required', 'error');
      return;
    }
    if (selectedRoles.length === 0) {
      addNotification('Select at least one role', 'error');
      return;
    }
    try {
      setLoading(true);
      const res = await api.post<WMSUser>('/api/v1/users', {
        ...form,
        phone: form.phone || undefined,
        roles: selectedRoles,
      });
      addNotification(`User "${res.full_name}" created successfully`, 'success');
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      addNotification(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">Create New User</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Rahul Sharma" className="input-field w-full text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">DC / Warehouse</label>
              <input value={form.dc_id} onChange={e => setForm(f => ({ ...f, dc_id: e.target.value }))} className="input-field w-full text-xs font-mono" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Email Address *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="rahul@company.com" className="input-field w-full text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Phone (for SMS)</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91XXXXXXXXXX" className="input-field w-full text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Language</label>
              <select value={form.preferred_language} onChange={e => setForm(f => ({ ...f, preferred_language: e.target.value }))} className="input-field w-full text-xs">
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="kn">Kannada</option>
                <option value="ta">Tamil</option>
              </select>
            </div>
          </div>

          {/* Role selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Assign Roles * <span className="text-white/20 font-normal normal-case">({selectedRoles.length} selected)</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {roles.map(role => {
                const selected = selectedRoles.includes(role.role_name);
                return (
                  <button
                    key={role.role_name}
                    type="button"
                    onClick={() => toggleRole(role.role_name)}
                    className={`text-left p-2.5 rounded-lg border transition-all ${selected ? 'border-[#00ff88]/30 bg-[#00ff88]/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-all ${selected ? 'bg-[#00ff88] border-[#00ff88]' : 'border-white/20'}`}>
                        {selected && <svg className="w-2 h-2 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-white/80 truncate">{role.label}</p>
                        <p className="text-[9px] text-white/30 truncate">{role.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/[0.08] text-xs text-white/50 hover:text-white/70 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 btn-primary py-2.5 text-xs font-semibold disabled:opacity-50">
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Roles Modal ─────────────────────────────────────────────────────────

function EditRolesModal({
  user,
  roles,
  onClose,
  onUpdated,
}: {
  user: WMSUser;
  roles: RoleMeta[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSave = async () => {
    if (selectedRoles.length === 0) {
      addNotification('Select at least one role', 'error');
      return;
    }
    try {
      setLoading(true);
      await api.put(`/api/v1/users/${user.user_id}/roles`, { roles: selectedRoles });
      addNotification(`Roles updated for ${user.full_name}`, 'success');
      onUpdated();
      onClose();
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Failed to update roles', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Edit Roles</h2>
            <p className="text-[10px] text-white/40 mt-0.5">{user.full_name} · {user.email}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
            {roles.map(role => {
              const selected = selectedRoles.includes(role.role_name);
              return (
                <button
                  key={role.role_name}
                  type="button"
                  onClick={() => toggleRole(role.role_name)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${selected ? 'border-[#00ff88]/30 bg-[#00ff88]/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-all ${selected ? 'bg-[#00ff88] border-[#00ff88]' : 'border-white/20'}`}>
                      {selected && <svg className="w-2 h-2 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-white/80 truncate">{role.label}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/[0.08] text-xs text-white/50 hover:text-white/70 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={loading} className="flex-1 btn-primary py-2.5 text-xs font-semibold disabled:opacity-50">
              {loading ? 'Saving…' : 'Save Roles'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { addNotification } = useNotifications();
  const [users, setUsers] = useState<WMSUser[]>([]);
  const [roles, setRoles] = useState<RoleMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<WMSUser | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<WMSUser | null>(null);

  const roleMap = Object.fromEntries(roles.map(r => [r.role_name, r]));

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes] = await Promise.all([
        api.get<{ data: WMSUser[] }>('/api/v1/users'),
        api.get<RoleMeta[]>('/api/v1/users/roles'),
      ]);
      setUsers(usersRes.data ?? []);
      setRoles(rolesRes ?? []);
    } catch {
      addNotification('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDeactivate = async (user: WMSUser) => {
    try {
      await api.del(`/api/v1/users/${user.user_id}`);
      addNotification(`${user.full_name} deactivated`, 'success');
      setConfirmDeactivate(null);
      fetchData();
    } catch (err: unknown) {
      addNotification(err instanceof Error ? err.message : 'Failed to deactivate', 'error');
    }
  };

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.roles.some(r => r.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">User Management</h1>
          <p className="text-xs text-white/40 mt-0.5">Create users · Assign roles · Manage access</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="btn-ghost text-xs">↻ Refresh</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs px-4 py-2">
            + New User
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Users', val: users.length, color: '#00ff88' },
          { label: 'Active (with roles)', val: users.filter(u => u.roles.length > 0).length, color: '#22c55e' },
          { label: 'Roles Available', val: roles.length, color: '#3b82f6' },
          { label: 'Inactive', val: users.filter(u => u.roles.length === 0).length, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-[10px] text-white/40 mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{loading ? '…' : s.val}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or role…"
          className="input-field text-xs flex-1 max-w-sm"
        />
        <span className="text-[10px] text-white/30">{filtered.length} users</span>
      </div>

      {/* User table */}
      <div className="card overflow-hidden">
        <table className="wms-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Roles</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j}><div className="h-3 bg-white/[0.06] rounded w-full" /></td>
                  ))}
                </tr>
              ))
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-white/20">
                  {users.length === 0 ? 'No users yet — create the first one' : 'No users match your search'}
                </td>
              </tr>
            )}
            {!loading && filtered.map(user => (
              <tr key={user.user_id}>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/60 flex-shrink-0">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white/80">{user.full_name}</p>
                      <p className="text-[9px] font-mono text-white/25">{user.user_id.slice(0, 8)}…</p>
                    </div>
                  </div>
                </td>
                <td><span className="text-xs text-white/60">{user.email}</span></td>
                <td><span className="text-xs font-mono text-white/40">{user.phone ?? '—'}</span></td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 ? (
                      <span className="status-pill text-[9px] bg-red-500/10 text-red-400 border border-red-500/20">Inactive</span>
                    ) : (
                      user.roles.slice(0, 3).map(r => (
                        <RoleBadge key={r} role={r} meta={roleMap[r]} />
                      ))
                    )}
                    {user.roles.length > 3 && (
                      <span className="text-[9px] text-white/30">+{user.roles.length - 3}</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="text-[10px] text-white/40">
                    {new Date(user.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="text-[10px] text-[#3b82f6]/70 hover:text-[#3b82f6] transition-colors font-semibold"
                    >
                      Edit Roles
                    </button>
                    <span className="text-white/10">·</span>
                    <button
                      onClick={() => setConfirmDeactivate(user)}
                      className="text-[10px] text-red-400/50 hover:text-red-400 transition-colors font-semibold"
                    >
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role reference */}
      <div className="card p-5">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-3">Role Reference</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {roles.map(role => (
            <div key={role.role_name} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]">
              <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: role.color }} />
              <div>
                <p className="text-[10px] font-semibold text-white/70">{role.label}</p>
                <p className="text-[9px] text-white/30 leading-relaxed">{role.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onCreated={fetchData}
        />
      )}

      {editingUser && (
        <EditRolesModal
          user={editingUser}
          roles={roles}
          onClose={() => setEditingUser(null)}
          onUpdated={fetchData}
        />
      )}

      {/* Deactivate confirmation */}
      {confirmDeactivate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-6 animate-fade-in space-y-4">
            <h2 className="text-sm font-bold text-white">Deactivate User?</h2>
            <p className="text-xs text-white/50">
              This will remove all roles from <span className="text-white/80 font-semibold">{confirmDeactivate.full_name}</span>.
              Their profile and audit history will be preserved.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeactivate(null)} className="flex-1 py-2.5 rounded-lg border border-white/[0.08] text-xs text-white/50 hover:text-white/70 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDeactivate(confirmDeactivate)} className="flex-1 py-2.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors">
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
