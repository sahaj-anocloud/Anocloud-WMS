'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api } from '@/lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface LiveAlert {
  alert_id: string;
  alert_type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  message: string;
  payload: Record<string, unknown>;
  triggered_at: string;
  is_acknowledged: boolean;
  acknowledged_by?: string;
}

type DiscStatus = 'open' | 'pending' | 'resolved';
type Severity = 'critical' | 'high' | 'medium' | 'low';

interface DisplayDiscrepancy {
  id: string;
  type: string;
  severity: Severity;
  vendor: string;
  asn: string;
  po: string;
  grn: string;
  description: string;
  raised: string;
  elapsed: number;
  status: DiscStatus;
  sku: string;
  expected?: number;
  actual?: number;
  variance?: number;
  raw: LiveAlert;
}

/* ─── Discrepancy alert types ────────────────────────────────────────────── */
const DISC_TYPES = new Set([
  'BARCODE_MISMATCH', 'GST_MISMATCH', 'GKM_HARD_STOP', 'GKM_SOFT_STOP',
  'ASN_OVER_DELIVERY', 'QUANTITY_SHORTAGE', 'DAMAGE_REPORT',
  'MOQ_VIOLATION', 'SAP_SYNC_DISCREPANCY', 'UNEXPECTED_ITEM',
]);

const TYPE_LABELS: Record<string, string> = {
  BARCODE_MISMATCH: 'Barcode Mismatch',
  GST_MISMATCH: 'GST Mismatch',
  GKM_HARD_STOP: 'GKM Hard-Stop',
  GKM_SOFT_STOP: 'GKM Soft-Stop',
  ASN_OVER_DELIVERY: 'ASN Over-Delivery',
  QUANTITY_SHORTAGE: 'Quantity Shortage',
  DAMAGE_REPORT: 'Damage Report',
  MOQ_VIOLATION: 'MOQ Violation',
  SAP_SYNC_DISCREPANCY: 'SAP Discrepancy',
  UNEXPECTED_ITEM: 'Unexpected Item',
};

const SEV_MAP: Record<string, Severity> = {
  Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low', Info: 'low',
};

const SEV_CONFIG: Record<Severity, { color: string; bg: string; border: string; text: string; label: string }> = {
  critical: { color: '#ef4444', bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',    label: 'Critical' },
  high:     { color: '#f97316', bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', label: 'High' },
  medium:   { color: '#f59e0b', bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  label: 'Medium' },
  low:      { color: '#3b82f6', bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   text: 'text-blue-400',   label: 'Low' },
};

const STATUS_CONFIG: Record<DiscStatus, { pill: string; label: string }> = {
  open:     { pill: 'bg-red-500/10 text-red-400 border border-red-500/20',       label: 'Open' },
  pending:  { pill: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', label: 'Pending' },
  resolved: { pill: 'bg-green-500/10 text-green-400 border border-green-500/20', label: 'Resolved' },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function toDiscrepancy(a: LiveAlert): DisplayDiscrepancy {
  const p = a.payload ?? {};
  const elapsed = Math.round((Date.now() - new Date(a.triggered_at).getTime()) / 60000);
  const status: DiscStatus = a.is_acknowledged ? 'pending' : 'open';
  return {
    id: a.alert_id.slice(0, 12).toUpperCase(),
    type: TYPE_LABELS[a.alert_type] ?? a.alert_type.replace(/_/g, ' '),
    severity: SEV_MAP[a.severity] ?? 'low',
    vendor: String(p.vendor_name ?? p.vendor_id ?? '—'),
    asn: String(p.asn_id ?? '—'),
    po: String(p.po_number ?? p.po_id ?? '—'),
    grn: String(p.delivery_id ?? p.grn_id ?? '—'),
    description: a.message,
    raised: new Date(a.triggered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    elapsed,
    status,
    sku: String(p.sku_id ?? '—'),
    expected: p.expected_qty != null ? Number(p.expected_qty) : undefined,
    actual: p.actual_qty != null ? Number(p.actual_qty) : undefined,
    variance: p.variance != null ? Number(p.variance) : undefined,
    raw: a,
  };
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

type FilterType = 'all' | 'open' | 'pending' | 'resolved';

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function DiscrepancyPage() {
  const { addNotification } = useNotifications();
  const [filter, setFilter] = useState<FilterType>('all');
  const [items, setItems] = useState<DisplayDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DisplayDiscrepancy | null>(null);
  const [resolution, setResolution] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDiscrepancies = useCallback(async () => {
    try {
      const data = await api.get<LiveAlert[]>('/api/v1/alerts');
      const discs = (Array.isArray(data) ? data : [])
        .filter(a => DISC_TYPES.has(a.alert_type))
        .map(toDiscrepancy);
      setItems(discs);
      // Auto-select first open item
      if (!selected) {
        const first = discs.find(d => d.status === 'open') ?? discs[0] ?? null;
        setSelected(first);
      }
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load discrepancies');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchDiscrepancies();
    const id = setInterval(fetchDiscrepancies, 30_000);
    return () => clearInterval(id);
  }, [fetchDiscrepancies]);

  const filtered = filter === 'all' ? items : items.filter(d => d.status === filter);
  const counts = {
    open: items.filter(d => d.status === 'open').length,
    pending: items.filter(d => d.status === 'pending').length,
    resolved: items.filter(d => d.status === 'resolved').length,
  };

  const handleEscalate = async (disc: DisplayDiscrepancy) => {
    try {
      await api.put(`/api/v1/alerts/${disc.raw.alert_id}/acknowledge`, {});
      setItems(prev => prev.map(d => d.id === disc.id ? { ...d, status: 'pending' as DiscStatus } : d));
      if (selected?.id === disc.id) setSelected(s => s ? { ...s, status: 'pending' } : s);
      addNotification('Discrepancy escalated to Supervisor', 'warning');
    } catch {
      addNotification('Failed to escalate', 'error');
    }
  };

  const handleResolve = async (disc: DisplayDiscrepancy) => {
    if (!resolution.trim()) { addNotification('Enter resolution notes before closing', 'error'); return; }
    setActionLoading(true);
    try {
      await api.put(`/api/v1/alerts/${disc.raw.alert_id}/acknowledge`, { resolution_notes: resolution });
      setItems(prev => prev.map(d => d.id === disc.id ? { ...d, status: 'resolved' as DiscStatus } : d));
      if (selected?.id === disc.id) setSelected(s => s ? { ...s, status: 'resolved' } : s);
      setResolution('');
      addNotification('Discrepancy resolved and closed ✓', 'success');
    } catch {
      addNotification('Failed to resolve discrepancy', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fade-in max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Discrepancy Management</h1>
          <p className="text-xs text-white/40 mt-0.5">Exception resolution · GRN discrepancies · Vendor claims</p>
        </div>
        <div className="flex items-center gap-2">
          {counts.open > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />{counts.open} Open
            </div>
          )}
          <button onClick={fetchDiscrepancies} className="text-xs text-white/40 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">⚠ {error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          : [
              { label: 'Open', count: counts.open, color: '#ef4444', f: 'open' },
              { label: 'Pending Review', count: counts.pending, color: '#f59e0b', f: 'pending' },
              { label: 'Resolved', count: counts.resolved, color: '#22c55e', f: 'resolved' },
            ].map(k => (
              <button key={k.label}
                onClick={() => setFilter(f => f === k.f ? 'all' : k.f as FilterType)}
                className={`card p-4 text-left transition-all hover:-translate-y-0.5 ${filter === k.f ? 'border-white/20' : ''}`}>
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{k.label}</p>
                <p className="text-2xl font-bold" style={{ color: k.color }}>{k.count}</p>
              </button>
            ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'open', 'pending', 'resolved'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${filter === f ? 'bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/25' : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/60'}`}>
            {f === 'all' ? `All (${items.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f as DiscStatus]})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* List panel */}
        <div className="lg:col-span-2 space-y-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            : filtered.length === 0
            ? <div className="card p-8 text-center text-white/30 text-sm">No discrepancies match this filter.</div>
            : filtered.map(d => {
                const sev = SEV_CONFIG[d.severity];
                const stat = STATUS_CONFIG[d.status];
                return (
                  <button key={d.id} onClick={() => setSelected(d)}
                    className={`w-full text-left card p-4 transition-all hover:border-white/15 ${selected?.id === d.id ? 'border-[#00ff88]/20 bg-[#00ff88]/[0.02]' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="font-mono text-[10px] text-white/50">{d.id}</span>
                        <p className="text-xs font-semibold text-white mt-0.5">{d.type}</p>
                      </div>
                      <span className={`status-pill text-[9px] ${sev.bg} ${sev.text} border ${sev.border}`}>{sev.label}</span>
                    </div>
                    <p className="text-[10px] text-white/50 mb-2 truncate">{d.vendor} · {d.asn}</p>
                    <div className="flex items-center justify-between">
                      <span className={`status-pill text-[9px] ${stat.pill}`}>{stat.label}</span>
                      <span className="text-[10px] text-white/30">{d.raised} · {d.elapsed}m ago</span>
                    </div>
                  </button>
                );
              })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="card p-12 text-center text-white/30 text-sm">Select a discrepancy to view details</div>
          ) : (() => {
            const sev = SEV_CONFIG[selected.severity];
            const stat = STATUS_CONFIG[selected.status];
            return (
              <div className="card p-6 space-y-5 animate-fade-in">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-white/50">{selected.id}</span>
                      <span className={`status-pill text-[9px] ${sev.bg} ${sev.text} border ${sev.border}`}>{sev.label}</span>
                      <span className={`status-pill text-[9px] ${stat.pill}`}>{stat.label}</span>
                    </div>
                    <h2 className="text-base font-bold text-white">{selected.type}</h2>
                  </div>
                  <span className="text-[10px] text-white/30">{selected.raised}</span>
                </div>

                <p className="text-xs text-white/60 leading-relaxed border-l-2 border-white/10 pl-3">{selected.description}</p>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: 'Vendor', v: selected.vendor },
                    { l: 'ASN', v: selected.asn },
                    { l: 'PO Reference', v: selected.po },
                    { l: 'GRN / Delivery', v: selected.grn },
                    { l: 'SKU', v: selected.sku },
                    { l: 'Elapsed', v: `${selected.elapsed}m` },
                  ].map(r => (
                    <div key={r.l} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                      <p className="text-[10px] text-white/30 mb-0.5">{r.l}</p>
                      <p className="text-xs font-mono text-white/80">{r.v}</p>
                    </div>
                  ))}
                </div>

                {(selected.expected != null || selected.actual != null) && (
                  <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <p className="text-[10px] text-white/40 mb-3 uppercase tracking-wider">Variance Analysis</p>
                    <div className="flex items-end gap-6">
                      {selected.expected != null && (
                        <div><p className="text-[10px] text-white/30">Expected</p><p className="text-lg font-bold text-white">{selected.expected}</p></div>
                      )}
                      {selected.actual != null && (
                        <div><p className="text-[10px] text-white/30">Actual</p><p className="text-lg font-bold text-white">{selected.actual}</p></div>
                      )}
                      {selected.variance != null && (
                        <div>
                          <p className="text-[10px] text-white/30">Variance</p>
                          <p className={`text-lg font-bold ${selected.variance < 0 ? 'text-red-400' : selected.variance > 0 ? 'text-green-400' : 'text-amber-400'}`}>
                            {selected.variance >= 0 ? '+' : ''}{selected.variance}
                          </p>
                        </div>
                      )}
                    </div>
                    {selected.variance != null && selected.variance !== 0 && selected.expected != null && (
                      <div className="mt-3 h-2 bg-white/[0.05] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-red-400"
                          style={{ width: `${Math.min(Math.abs(selected.variance / selected.expected) * 100, 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}

                {selected.status !== 'resolved' && (
                  <div className="space-y-3">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider block">Resolution Notes</label>
                    <textarea value={resolution} onChange={e => setResolution(e.target.value)}
                      placeholder="Document resolution action taken…" rows={3}
                      className="input-field text-xs resize-none" />
                    <div className="flex gap-2">
                      {selected.status === 'open' && (
                        <button onClick={() => handleEscalate(selected)}
                          className="btn-ghost flex-1 text-xs py-2.5">
                          ESCALATE TO SUPERVISOR
                        </button>
                      )}
                      <button onClick={() => handleResolve(selected)} disabled={actionLoading}
                        className="btn-primary flex-1 text-xs py-2.5 disabled:opacity-40">
                        {actionLoading ? 'Saving...' : 'MARK AS RESOLVED ✓'}
                      </button>
                    </div>
                  </div>
                )}

                {selected.status === 'resolved' && (
                  <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/[0.05] flex items-center gap-3">
                    <span className="text-2xl text-green-400">✓</span>
                    <div>
                      <p className="text-sm font-bold text-green-400">Discrepancy Resolved</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Closed and logged in audit trail</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
