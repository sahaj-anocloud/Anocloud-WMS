'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
type AlertStatus = 'active' | 'acknowledged' | 'escalated' | 'resolved';

interface LiveAlert {
  alert_id: string;
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  payload: Record<string, unknown>;
  triggered_at: string;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  delivery_id?: string;
  vendor_name?: string;
  dc_id: string;
}

interface DisplayAlert extends LiveAlert {
  status: AlertStatus;
  elapsed: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const SEV: Record<string, { color: string; bg: string; border: string }> = {
  Critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  High:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  Warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  Medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  Low:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
  Info:     { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
};

const DEFAULT_SEV = SEV.Info;

function humanType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function elapsedMin(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function toDisplay(a: LiveAlert): DisplayAlert {
  const status: AlertStatus = a.is_acknowledged ? 'acknowledged' : 'active';
  return { ...a, status, elapsed: elapsedMin(a.triggered_at) };
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AlertCenterPage() {
  const { addNotification } = useNotifications();
  const [alerts, setAlerts] = useState<DisplayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AlertSeverity | AlertStatus>('all');
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchAlerts = useCallback(async () => {
    const dcId = auth.getDcId();
    try {
      const data = await api.get<LiveAlert[]>(`/api/v1/alerts?dc_id=${dcId}&limit=20`);
      setAlerts((Array.isArray(data) ? data : []).map(toDisplay));
      setLastRefresh(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const acknowledge = async (alertId: string) => {
    setAckingId(alertId);
    try {
      await api.post(`/api/v1/alerts/${alertId}/acknowledge`, {
        user_id: auth.getUserId()
      });
      setAlerts(prev => prev.map(a =>
        a.alert_id === alertId ? { ...a, status: 'acknowledged' as AlertStatus, is_acknowledged: true, acknowledged_by: auth.getUserId() } : a
      ));
      addNotification(`Alert ${alertId.slice(0, 8)} acknowledged`, 'success');
    } catch (err: any) {
      addNotification(err.message || 'Failed to acknowledge alert', 'error');
    } finally {
      setAckingId(null);
    }
  };

  const escalate = async (alertId: string) => {
    try {
      await api.post(`/api/v1/alerts/${alertId}/escalate`, {
        user_id: auth.getUserId(),
        reason: 'Vendor requested escalation'
      });
      setAlerts(prev => prev.map(a =>
        a.alert_id === alertId ? { ...a, status: 'escalated' as AlertStatus } : a
      ));
      addNotification(`Alert escalated to SCM Head`, 'warning');
    } catch {
      addNotification('Escalation failed', 'error');
    }
  };

  const filtered = alerts.filter(a => {
    if (filter === 'all') return true;
    const sevValues: string[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];
    if (sevValues.includes(filter)) return a.severity === filter;
    return a.status === filter;
  });

  const counts = {
    active: alerts.filter(a => a.status === 'active').length,
    critical: alerts.filter(a => a.severity === 'Critical' && !a.is_acknowledged).length,
    escalated: alerts.filter(a => a.status === 'escalated').length,
    acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
    resolved: alerts.filter(a => a.status === 'resolved').length,
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fade-in max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Alert Center</h1>
          <p className="text-xs text-white/40 mt-0.5">Real-time alerts · Escalation management · Acknowledgement tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {counts.critical > 0 && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {counts.critical} Critical Unresolved
            </div>
          )}
          <button onClick={fetchAlerts} className="text-xs text-white/40 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors">
            ↻ {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">⚠ {error}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          : [
              { label: 'Active Alerts', val: counts.active, color: '#ef4444' },
              { label: 'Escalated', val: counts.escalated, color: '#f59e0b' },
              { label: 'Acknowledged', val: counts.acknowledged, color: '#3b82f6' },
              { label: 'Total', val: alerts.length, color: '#22c55e' },
            ].map(s => (
              <div key={s.label} className="card p-4">
                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-3xl font-bold" style={{ color: s.color }}>{s.val}</p>
              </div>
            ))}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all', label: `All (${alerts.length})` },
          { key: 'active', label: `Active (${counts.active})` },
          { key: 'escalated', label: `Escalated (${counts.escalated})` },
          { key: 'Critical', label: 'Critical' },
          { key: 'High', label: 'High' },
          { key: 'Medium', label: 'Medium' },
          { key: 'acknowledged', label: 'Acknowledged' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key as typeof filter)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${filter === f.key ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/70'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-white/30 text-sm">No alerts match the current filter.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => {
            const cfg = SEV[alert.severity] || DEFAULT_SEV;
            const isActive = alert.status === 'active';
            const isEscalated = alert.status === 'escalated';
            const isAcking = ackingId === alert.alert_id;

            return (
              <div key={alert.alert_id} className="rounded-xl border p-4 transition-all duration-200"
                style={{
                  background: isActive ? cfg.bg : 'rgba(255,255,255,0.02)',
                  borderColor: isActive ? cfg.border : isEscalated ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)',
                }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: isActive ? cfg.color : 'rgba(255,255,255,0.2)' }} />
                      <div className="w-px flex-1 bg-white/[0.06]" style={{ minHeight: '20px' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[10px] text-white/30">{alert.alert_id.slice(0, 8)}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {alert.severity}
                        </span>
                        <span className="text-[10px] text-white/40">{humanType(alert.alert_type)}</span>
                        {isEscalated && <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold">ESCALATED</span>}
                        {alert.is_acknowledged && <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold">ACK'd{alert.acknowledged_by ? ` by ${alert.acknowledged_by}` : ''}</span>}
                      </div>

                      <p className="text-sm font-semibold text-white/80 mb-1">{alert.message}</p>

                      {alert.payload && Object.keys(alert.payload).length > 0 && (
                        <p className="text-[11px] text-white/45 leading-relaxed mb-1">
                          {Object.entries(alert.payload).slice(0, 3).map(([k, v]) =>
                            `${k.replace(/_/g, ' ')}: ${String(v)}`).join(' · ')}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-white/30">
                        <span>{new Date(alert.triggered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className={`font-mono font-bold ${alert.elapsed > 60 ? 'text-red-400' : alert.elapsed > 30 ? 'text-amber-400' : 'text-white/40'}`}>
                          +{alert.elapsed}m ago
                        </span>
                        {alert.vendor_name && <span>· {alert.vendor_name}</span>}
                        {alert.delivery_id && <span className="font-mono">· {alert.delivery_id}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {isActive && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => acknowledge(alert.alert_id)} disabled={isAcking}
                        className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors cursor-pointer disabled:opacity-40">
                        {isAcking ? '...' : 'ACK'}
                      </button>
                      <button onClick={() => escalate(alert.alert_id)}
                        className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer">
                        ESC
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-white/20 text-center">
        All alerts logged with timestamp, user ID, device ID per BR-16. Auto-refreshes every 30s.
      </p>
    </div>
  );
}
