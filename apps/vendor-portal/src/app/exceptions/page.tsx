'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type ExcStatus = 'open' | 'pending' | 'resolved';

interface DisplayException {
  id: string;
  type: 'OverDelivery' | 'Quarantine' | 'GKMBreach' | 'CommercialVariance' | string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  vendor: string;
  delivery: string;
  sku: string;
  detail: string;
  raised: string;
  elapsed: number;
  status: ExcStatus;
  backend_type: 'variance' | 'quarantine';
}

const TYPE_COLORS: Record<string, string> = {
  OverDelivery: '#f59e0b', // Amber
  Quarantine: '#ef4444',   // Red
  GKMBreach: '#f97316',    // Orange
  CommercialVariance: '#3b82f6', // Blue
};

const SEV_MAP: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low', Info: 'low',
};

const SEV_CONFIG = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  high:     { label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' },
  medium:   { label: 'Medium',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  low:      { label: 'Low',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
};

/* ─── Components ─────────────────────────────────────────────────────────── */
function SeverityBadge({ sev }: { sev: 'critical' | 'high' | 'medium' | 'low' }) {
  const c = SEV_CONFIG[sev];
  return (
    <span className="status-pill text-[9px]" style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function ExceptionsPage() {
  const { addNotification } = useNotifications();
  const [exceptions, setExceptions] = useState<DisplayException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ExcStatus>('all');
  const [selected, setSelected] = useState<DisplayException | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchExceptions = useCallback(async () => {
    const dcId = auth.getDcId();
    try {
      const data = await api.get<any[]>(`/api/v1/exceptions?dc_id=${dcId}`);
      const exc = (Array.isArray(data) ? data : []).map(ex => ({
        id: ex.exception_id,
        type: ex.type,
        severity: SEV_MAP[ex.severity] ?? 'low',
        vendor: ex.vendor_name,
        delivery: ex.delivery_id,
        sku: '—',
        detail: ex.description,
        raised: new Date(ex.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        elapsed: Math.round((Date.now() - new Date(ex.created_at).getTime()) / 60000),
        status: ex.status === 'Open' ? 'open' : 'resolved',
        backend_type: ex.type === 'Quarantine' ? 'quarantine' : 'variance'
      }));
      setExceptions(exc);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load exceptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExceptions();
    const id = setInterval(fetchExceptions, 30_000);
    return () => clearInterval(id);
  }, [fetchExceptions]);

  const filtered = exceptions.filter(e => filter === 'all' || e.status === filter);
  const counts = {
    open: exceptions.filter(e => e.status === 'open').length,
    pending: exceptions.filter(e => e.status === 'pending').length,
    resolved: exceptions.filter(e => e.status === 'resolved').length,
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!reasonCode.trim()) { addNotification('Reason code is required', 'error'); return; }
    if (!selected) return;
    setActionLoading(true);
    try {
      if (selected.backend_type === 'quarantine') {
        await api.put(`/api/v1/quarantine/${selected.id}/resolve`, { 
          outcome: action === 'approve' ? 'Accept' : 'Reject', 
          reason_code: reasonCode 
        });
      } else {
        await api.patch(`/api/v1/alerts/${selected.id}/acknowledge`, { 
          reason_code: reasonCode, 
          action: action === 'reject' ? 'reject' : 'approve' 
        });
      }
      
      setExceptions(prev => prev.map(e =>
        e.id === selected.id ? { ...e, status: action === 'approve' ? 'pending' : 'resolved' } : e
      ));
      addNotification(`Exception ${selected.id} ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
      setSelected(null); setReasonCode('');
    } catch (e: any) {
      addNotification(e.message || `Failed to ${action} exception`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fade-in max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Exception Queue</h1>
          <p className="text-xs text-white/40 mt-0.5">Live operational variances · Quality holds · GKM governance</p>
        </div>
        <div className="flex items-center gap-2">
          {counts.open > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {counts.open} Open
            </div>
          )}
          <button onClick={fetchExceptions} className="text-xs text-white/40 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">⚠ {error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />) : [
          { label: 'GKM Breach', count: exceptions.filter(e => e.type === 'GKMBreach').length, color: TYPE_COLORS.GKMBreach, desc: 'Hard/Soft stop approval required' },
          { label: 'Quarantine', count: exceptions.filter(e => e.type === 'Quarantine').length, color: TYPE_COLORS.Quarantine, desc: 'Inventory quality holds' },
          { label: 'Over Delivery', count: exceptions.filter(e => e.type === 'OverDelivery').length, color: TYPE_COLORS.OverDelivery, desc: 'Excess quantity variance' },
        ].map(s => (
          <div key={s.label} className="card p-4" style={{ borderColor: `${s.color}20` }}>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: s.color }}>{s.count}</p>
            <p className="text-[10px] text-white/30 mt-1">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'open', 'pending', 'resolved'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${filter === f ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/70'}`}>
            {f === 'all' ? `All (${exceptions.length})` : `${f} (${exceptions.filter(e => e.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-white/30 text-sm">No exceptions match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="wms-table">
              <thead>
                <tr><th>ID</th><th>Type</th><th>Severity</th><th>Vendor / Delivery</th><th>Detail</th><th>Raised</th><th>Elapsed</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map(exc => (
                  <tr key={exc.id} className="cursor-pointer" onClick={() => setSelected(exc)}>
                    <td><span className="font-mono text-xs text-white/70">{exc.id.slice(0, 8)}</span></td>
                    <td>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${TYPE_COLORS[exc.type] || '#666'}15`, color: TYPE_COLORS[exc.type] || '#666', border: `1px solid ${TYPE_COLORS[exc.type] || '#666'}30` }}>
                        {exc.type.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </td>
                    <td><SeverityBadge sev={exc.severity} /></td>
                    <td>
                      <p className="text-xs text-white/70">{exc.vendor}</p>
                      <p className="text-[10px] font-mono text-white/30">{exc.delivery}</p>
                    </td>
                    <td><p className="text-[11px] text-white/50 max-w-xs truncate">{exc.detail}</p></td>
                    <td><span className="text-xs text-white/40">{exc.raised}</span></td>
                    <td>
                      <span className={`text-xs font-mono font-bold ${exc.elapsed > 60 ? 'text-red-400' : exc.elapsed > 30 ? 'text-amber-400' : 'text-white/50'}`}>
                        {exc.elapsed}m {exc.elapsed > 60 ? '⚠' : ''}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${exc.status === 'open' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : exc.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                        {exc.status === 'open' ? '• Open' : exc.status === 'pending' ? '⏳ Pending' : '✓ Resolved'}
                      </span>
                    </td>
                    <td>
                      {exc.status !== 'resolved' && (
                        <button onClick={e => { e.stopPropagation(); setSelected(exc); }}
                          className="text-[10px] text-[#00ff88]/60 hover:text-[#00ff88] font-bold tracking-wider transition-colors cursor-pointer">
                          REVIEW →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg card p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-bold text-white">{selected.id.slice(0, 8)}</span>
                  <SeverityBadge sev={selected.severity} />
                </div>
                <p className="font-semibold" style={{ color: TYPE_COLORS[selected.type] }}>{selected.type.replace(/([A-Z])/g, ' $1').trim()}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white/60 text-xl cursor-pointer">✕</button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                <p className="text-xs text-white/40 mb-1">Exception Detail</p>
                <p className="text-sm text-white/80 leading-relaxed">{selected.detail}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { l: 'Delivery / ASN', v: selected.delivery },
                  { l: 'Vendor', v: selected.vendor },
                  { l: 'Raised At', v: selected.raised },
                  { l: 'Elapsed', v: `${selected.elapsed}m` },
                ].map(r => (
                  <div key={r.l}>
                    <p className="text-white/30 mb-0.5">{r.l}</p>
                    <p className="text-white/80 font-medium font-mono">{r.v}</p>
                  </div>
                ))}
              </div>
            </div>

            {selected.status !== 'resolved' && (
              <>
                <div className="mb-4">
                  <label className="text-xs text-white/40 uppercase tracking-wider block mb-2">Mandatory Reason Code *</label>
                  <select value={reasonCode} onChange={e => setReasonCode(e.target.value)} className="input-field text-xs">
                    <option value="" className="bg-[#0d1117]">Select reason code...</option>
                    <option value="VND-PRICE-CHANGE" className="bg-[#0d1117]">VND-PRICE-CHANGE — Vendor price update</option>
                    <option value="PO-AMEND" className="bg-[#0d1117]">PO-AMEND — PO amendment pending</option>
                    <option value="MGMT-OVERRIDE" className="bg-[#0d1117]">MGMT-OVERRIDE — Management exception</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAction('approve')} disabled={actionLoading} className="btn-primary flex-1 disabled:opacity-40">
                    {actionLoading ? 'Processing...' : 'Approve Override →'}
                  </button>
                  <button onClick={() => handleAction('reject')} disabled={actionLoading} className="btn-danger flex-1 disabled:opacity-40">
                    Halt Delivery
                  </button>
                </div>
                <p className="text-[10px] text-white/20 text-center mt-3">Override logged with user ID, timestamp, device ID per BR-16</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
