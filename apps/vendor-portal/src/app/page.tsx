'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/layout';
import { useNotifications } from '@/lib/notifications';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const ROLES = [
  { id: 'scm_head',   label: 'SCM Head',        desc: 'Full system access, GKM hard-stop approvals', color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.2)' },
  { id: 'supervisor', label: 'Inbound Supervisor', desc: 'Dock ops, QC review, exception management',  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
  { id: 'finance',    label: 'Finance User',     desc: 'GST checks, cost holds, GRPO approvals',      color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  { id: 'qc',         label: 'QC Associate',     desc: 'Scanning, batch capture, QC pass/fail',       color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  { id: 'vendor',     label: 'Vendor User',      desc: 'ASN submission, appointments, compliance',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
  { id: 'gate',       label: 'Gate Staff',       desc: 'Vehicle registration, yard queue view',       color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setRole } = useRole();
  const { addNotification } = useNotifications();
  const [selectedRole, setSelectedRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [step, setStep] = useState<'role' | 'auth'>('role');

  const chosen = ROLES.find(r => r.id === selectedRole);

  const handleRoleSelect = (id: string) => {
    setSelectedRole(id);
    setEmail(`${id}@sumosave.in`);
    setLoginError('');
    setStep('auth');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRole, email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `Login failed (${res.status})`);
      }

      const data = await res.json() as {
        token: string; user_id: string; roles: string[]; dc_id: string; role_id: string;
      };

      // Store token for all subsequent API calls
      sessionStorage.setItem('wms_token', data.token);
      sessionStorage.setItem('wms_user_id', data.user_id);
      sessionStorage.setItem('wms_dc_id', data.dc_id);
      sessionStorage.setItem('wms_roles', JSON.stringify(data.roles));
      sessionStorage.setItem('wms_role_id', selectedRole); // for sidebar rehydration on refresh

      setRole(selectedRole as any);
      addNotification(`Welcome back, ${chosen?.label}!`, 'success');

      const roleRoutes: Record<string, string> = {
        scm_head:   '/dashboard',
        supervisor: '/dock-queue',
        finance:    '/exceptions',
        qc:         '/receiving',
        vendor:     '/shipments/new',
        gate:       '/gate-entry',
      };
      router.push(roleRoutes[selectedRole] || '/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setLoginError(msg);
      addNotification(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#060818' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[520px] border-r border-white/[0.06] p-12 relative overflow-hidden">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(0,255,136,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#060818] to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="flex items-center gap-3 mb-16 relative z-10">
          <div className="w-9 h-9 bg-[#00ff88] rounded-xl rotate-12 shadow-[0_0_25px_rgba(0,255,136,0.4)]" />
          <div>
            <p className="text-xl font-bold tracking-tight" style={{ textShadow: '0 0 20px rgba(0,255,136,0.3)', color: '#00ff88' }}>SUMOSAVE</p>
            <p className="text-[10px] text-white/30 tracking-widest">WMS PLATFORM</p>
          </div>
        </div>

        <div className="flex-1 relative z-10">
          <h1 className="text-4xl font-bold leading-tight mb-6 text-white">
            Inbound Supply<br />
            <span style={{ color: '#00ff88', textShadow: '0 0 20px rgba(0,255,136,0.3)' }}>Chain Control</span><br />
            Reimagined.
          </h1>
          <p className="text-white/40 text-sm leading-relaxed mb-10">
            Phase 1 covers gate-to-GRN. Every scan, every approval, every exception — digitally captured, rule-validated, and SAP-posted in real time.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { val: '22', label: 'API Modules' },
              { val: '12', label: 'Business Rules' },
              { val: '<1s', label: 'Scan Latency' },
            ].map(s => (
              <div key={s.label} className="glass-light rounded-xl p-4">
                <p className="text-2xl font-bold" style={{ color: '#00ff88' }}>{s.val}</p>
                <p className="text-xs text-white/40 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-8">
          <p className="text-[10px] text-white/20">© 2026 SumoSave Technologies · TLS 1.3 · AES-256</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg">
          {step === 'role' ? (
            <div className="animate-fade-in">
              <div className="mb-8">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Enterprise SSO</p>
                <h2 className="text-2xl font-bold text-white">Select Your Role</h2>
                <p className="text-white/40 text-sm mt-1">Access is scoped to your assigned role permissions.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map(role => (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id)}
                    className="text-left p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer group"
                    style={{
                      background: role.bg,
                      borderColor: role.border,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: role.color, boxShadow: `0 0 8px ${role.color}` }}
                      />
                      <p className="text-xs font-bold tracking-wide" style={{ color: role.color }}>
                        {role.label}
                      </p>
                    </div>
                    <p className="text-[11px] text-white/40 leading-snug">{role.desc}</p>
                  </button>
                ))}
              </div>

              <p className="text-center text-xs text-white/20 mt-6">
                Protected by SumoSave Enterprise Keycloak Identity
              </p>
            </div>
          ) : (
            <div className="animate-fade-in">
              <button
                onClick={() => setStep('role')}
                className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 mb-8 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                  <path strokeLinecap="round" d="M10 12L6 8l4-4" />
                </svg>
                Back to role selection
              </button>

              {chosen && (
                <div className="flex items-center gap-3 mb-8 p-4 rounded-xl" style={{ background: chosen.bg, border: `1px solid ${chosen.border}` }}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: chosen.color, boxShadow: `0 0 10px ${chosen.color}` }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: chosen.color }}>{chosen.label}</p>
                    <p className="text-xs text-white/40">{chosen.desc}</p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-1">Authenticate</h2>
                <p className="text-white/40 text-sm">Enter your SumoSave identity credentials.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Employee ID / Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Password</label>
                    <a href="#" className="text-xs" style={{ color: '#00ff88' }}>Forgot password?</a>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field"
                  />
                </div>
                {loginError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    ⚠ {loginError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wider transition-all btn-primary"
                  style={{ opacity: isLoading ? 0.6 : 1 }}
                >
                  {isLoading ? 'AUTHENTICATING...' : 'SECURE LOGIN →'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
