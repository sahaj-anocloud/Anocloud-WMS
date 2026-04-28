'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, KPISnapshot, AlertItem, ExceptionItem, auth } from '@/lib/api';

/* ─── Yard entry shape from GET /api/v1/yard/queue ───────────────────────── */
interface YardQueueEntry {
  entry_id: string;
  vehicle_reg: string;
  vendor_name: string;
  asn_id: string | null;
  gate_in_at: string;
  dock_door: string | null;
  status: string;
  dwell_seconds: number;
}

/* ─── Mini sparkline ─────────────────────────────────────────────────────── */
function Sparkline({ data, color = '#00ff88' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity="0.08" stroke="none" />
    </svg>
  );
}

/* ─── Radial KPI ─────────────────────────────────────────────────────────── */
function RadialKPI({ value, target, label, color = '#00ff88' }: { value: number; target: number; label: string; color?: string }) {
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / target, 1);
  const dash = pct * circ;
  return (
    <div className="flex items-center gap-3">
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize="10" fontWeight="700">{Math.round(value)}%</text>
      </svg>
      <div>
        <p className="text-xs font-semibold text-white/80">{label}</p>
        <p className="text-[10px] text-white/30 mt-0.5">Target {target}%</p>
      </div>
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */
interface KPICardProps {
  label: string; value: string | number; unit?: string;
  status?: 'good' | 'warn' | 'bad' | 'neutral'; target?: string;
  sparkData?: number[]; color?: string;
}
function KPICard({ label, value, unit, status = 'neutral', target, sparkData, color = '#00ff88' }: KPICardProps) {
  const statusColors = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', neutral: '#00ff88' };
  const sc = statusColors[status];
  return (
    <div className="card p-5 relative overflow-hidden group hover:-translate-y-0.5 transition-all duration-200">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `${sc}20` }} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{label}</p>
        {status !== 'neutral' && (
          <span className={`status-pill ${status === 'good' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : status === 'warn' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {status === 'good' ? '✓ On Track' : status === 'warn' ? '⚠ Monitor' : '✕ Alert'}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-white">{value}</span>
            {unit && <span className="text-sm text-white/30">{unit}</span>}
          </div>
          {target && <p className="text-[10px] text-white/25 mt-0.5">Target: {target}</p>}
        </div>
        {sparkData && <Sparkline data={sparkData} color={sc} />}
      </div>
    </div>
  );
}

/* ─── Elapsed Bar ─────────────────────────────────────────────────────────── */
function ElapsedBar({ elapsed, max = 90 }: { elapsed: number; max?: number }) {
  const pct = Math.min((elapsed / max) * 100, 100);
  const color = pct < 60 ? '#22c55e' : pct < 80 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{elapsed}m</span>
    </div>
  );
}

/* ─── Skeleton loader ─────────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function getDeliveryStatus(dwellSec: number): 'on-track' | 'at-risk' | 'breached' {
  const min = dwellSec / 60;
  if (min > 90) return 'breached';
  if (min > 60) return 'at-risk';
  return 'on-track';
}

function getKPIStatus(value: number, target: number, higherIsBetter = true): 'good' | 'warn' | 'bad' {
  const pct = higherIsBetter ? value / target : target / value;
  if (pct >= 1) return 'good';
  if (pct >= 0.9) return 'warn';
  return 'bad';
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function ControlTowerPage() {
  const [kpi, setKpi] = useState<KPISnapshot | null>(null);
  const [yard, setYard] = useState<YardQueueEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    const dcId = auth.getDcId();
    try {
      const [kpiData, yardData, alertData, exceptionData] = await Promise.all([
        api.get<KPISnapshot>('/api/v1/reports/control-tower'),
        api.get<YardQueueEntry[]>(`/api/v1/yard/queue?dc_id=${dcId}`),
        api.get<AlertItem[]>(`/api/v1/alerts?limit=5`),
        api.get<ExceptionItem[]>(`/api/v1/exceptions?limit=5`),
      ]);
      setKpi(kpiData);
      setIsFallback(kpiData._fallback === true);
      setYard(Array.isArray(yardData) ? yardData : []);
      setAlerts(Array.isArray(alertData) ? alertData : []);
      setExceptions(Array.isArray(exceptionData) ? exceptionData : []);
      setLastRefresh(new Date());
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(msg);
      setIsFallback(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fade-in max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Control Tower</h1>
          <p className="text-xs text-white/40 mt-0.5">Real-time inbound operations · DC Bangalore · Refreshes every 5 min</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
            <span className="live-dot" />
            <span className="text-[#00ff88]/70">Live</span>
            <span className="text-white/20">·</span>
            <span>{lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <button onClick={fetchData} className="text-[10px] text-white/40 hover:text-white/70 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Fallback / Error Banner */}
      {isFallback && !error && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400 flex items-center gap-2">
          <span>⚠</span> Database unavailable — showing baseline (zero) KPIs. Connect PostgreSQL and run the KPI snapshot job to see live data.
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400 flex items-center gap-2">
          <span>⚠</span> {error} — showing last known data.
        </div>
      )}

      {/* KPI Grid Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : kpi ? (<>
          <KPICard label="ASN Coverage" value={Math.round(Number(kpi.asn_coverage_rate) || 0)} unit="%" status={getKPIStatus(Number(kpi.asn_coverage_rate) || 0, 80)} target=">80%" />
          <KPICard label="Gate-to-GRN" value={kpi.gate_to_grn_time_avg_min ? Math.round(Number(kpi.gate_to_grn_time_avg_min)) : '—'} unit="min" status={kpi.gate_to_grn_time_avg_min ? getKPIStatus(60, Number(kpi.gate_to_grn_time_avg_min) || 0) : 'neutral'} target="<60 min" color="#22c55e" />
          <KPICard label="First-Pass Yield" value={Math.round(Number(kpi.receipt_first_pass_yield) || 0)} unit="%" status={getKPIStatus(Number(kpi.receipt_first_pass_yield) || 0, 85)} target=">85%" color="#22c55e" />
          <KPICard label="Barcode Remed." value={Math.round(Number(kpi.barcode_remediation_rate) || 0)} unit="%" status={(Number(kpi.barcode_remediation_rate) || 0) < 10 ? 'good' : 'warn'} target="<10%" color="#f59e0b" />
        </>) : null}
      </div>

      {/* KPI Grid Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : kpi ? (<>
          <KPICard label="Scanning Compliance" value={Math.round(Number(kpi.scanning_compliance_rate) || 0)} unit="%" status={getKPIStatus(Number(kpi.scanning_compliance_rate) || 0, 100)} target="100%" />
          <KPICard label="Inventory Accuracy" value={(Number(kpi.inventory_accuracy_rate) || 0).toFixed(1)} unit="%" status={getKPIStatus(Number(kpi.inventory_accuracy_rate) || 0, 98)} target=">98%" color="#22c55e" />
          <KPICard label="Perishable Dwell" value={kpi.perishable_dwell_avg_min ? Math.round(kpi.perishable_dwell_avg_min) : '—'} unit="min" status={kpi.perishable_dwell_avg_min ? getKPIStatus(30, kpi.perishable_dwell_avg_min) : 'neutral'} target="<30 min" color="#3b82f6" />
          <KPICard label="Total Deliveries" value={kpi.total_deliveries} unit="" status="neutral" target="Live" color="#a78bfa" />
        </>) : null}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live deliveries table */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <h2 className="text-sm font-bold text-white">Active Deliveries</h2>
              {!loading && <span className="text-[10px] bg-white/[0.05] text-white/40 px-2 py-0.5 rounded-full">{yard.length}</span>}
            </div>
            <Link href="/dock-queue" className="text-[10px] text-[#00ff88]/60 hover:text-[#00ff88] transition-colors font-bold tracking-wider">DOCK VIEW →</Link>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : yard.length === 0 ? (
              <div className="p-10 text-center text-white/30 text-sm">No active deliveries at this time.</div>
            ) : (
              <table className="wms-table">
                <thead><tr><th>ASN / Vehicle</th><th>Vendor</th><th>Status</th><th>Dock</th><th>Dwell</th></tr></thead>
                <tbody>
                  {yard.map(entry => {
                    const dwellMin = Math.round(entry.dwell_seconds / 60);
                    const status = getDeliveryStatus(entry.dwell_seconds);
                    return (
                      <tr key={entry.entry_id} className="cursor-pointer">
                        <td>
                          <p className="font-mono text-[11px] text-white/80">{entry.asn_id ?? '—'}</p>
                          <p className="text-[10px] text-white/30">{entry.vehicle_reg}</p>
                        </td>
                        <td><p className="text-xs text-white/70 truncate max-w-[120px]">{entry.vendor_name}</p></td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${status === 'on-track' ? 'bg-green-400' : status === 'at-risk' ? 'bg-amber-400' : 'bg-red-400'}`} />
                            <span className="text-xs text-white/60 capitalize">{entry.status.replace('_', ' ')}</span>
                          </div>
                        </td>
                        <td><span className="font-mono text-xs text-[#3b82f6]">{entry.dock_door ?? '—'}</span></td>
                        <td><ElapsedBar elapsed={dwellMin} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column: Alerts & Exceptions Feed */}
        <div className="space-y-4">
          {/* Recent Alerts */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Alert Center</h2>
              <Link href="/alerts" className="text-[10px] text-[#00ff88]/60 hover:text-[#00ff88]">VIEW ALL</Link>
            </div>
            <div className="space-y-3">
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />) :
               alerts.length === 0 ? <p className="text-[10px] text-white/20 text-center py-2">No active alerts</p> :
               alerts.map(a => (
                <div key={a.alert_id} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${a.severity === 'Critical' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-amber-500'}`} />
                  <div>
                    <p className="text-[11px] text-white/80 leading-tight">{a.message}</p>
                    <p className="text-[9px] text-white/30 mt-1 uppercase tracking-wider">{new Date(a.triggered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {a.alert_type}</p>
                  </div>
                </div>
               ))}
            </div>
          </div>

          {/* Critical Exceptions */}
          <div className="card p-5 border-l-2 border-red-500/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Open Exceptions</h2>
              <Link href="/exceptions" className="text-[10px] text-[#ef4444]/60 hover:text-[#ef4444]">QUEUE →</Link>
            </div>
            <div className="space-y-3">
              {loading ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14" />) :
               exceptions.length === 0 ? <p className="text-[10px] text-white/20 text-center py-2">Queue clear</p> :
               exceptions.map(e => (
                <div key={e.exception_id} className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-tighter">{e.type}</span>
                    <span className="text-[9px] text-white/20">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[11px] text-white/70 truncate">{e.description}</p>
                  <p className="text-[10px] text-white/40 mt-1">{e.vendor_name} · {e.delivery_id}</p>
                </div>
               ))}
            </div>
          </div>

          {/* Snapshot Summary */}
          <div className="card p-5 bg-gradient-to-br from-white/[0.02] to-transparent">
            <h2 className="text-sm font-bold text-white mb-4">System Health</h2>
            {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : kpi ? (
              <div className="space-y-4">
                <RadialKPI value={Number(kpi.asn_coverage_rate) || 0} target={80} label="ASN Coverage" color="#00ff88" />
                <RadialKPI value={Number(kpi.receipt_first_pass_yield) || 0} target={85} label="First-Pass Yield" color="#22c55e" />
                <div className="pt-2 border-t border-white/[0.05]">
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>Total Deliveries</span>
                    <span className="text-white/70">{kpi.total_deliveries}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Snapshot timestamp */}
      {kpi && (
        <p className="text-[10px] text-white/20 text-right">
          KPI snapshot at: {new Date(kpi.snapshot_at).toLocaleString('en-IN')}
        </p>
      )}
    </div>
  );
}
