'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorScorecard {
  vendor_id: string;
  vendor_name: string;
  gstin: string;
  compliance_status: string;
  category: string;
  asn_coverage_rate: number;
  on_time_delivery_rate: number;
  first_pass_yield: number;
  doc_currency_rate: number;
  barcode_remediation_rate: number;
  total_deliveries: number;
  total_asns: number;
  last_delivery_at: string | null;
  incident_count: number;
  composite_score: number;
  tier: 'gold' | 'silver' | 'bronze' | 'watch';
  trend: 'up' | 'down' | 'flat';
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  gold:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  label: '🥇 Gold',       desc: 'Score ≥90, zero incidents' },
  silver: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', label: '🥈 Silver',     desc: 'Score 75–89' },
  bronze: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)',  border: 'rgba(205,127,50,0.25)',  label: '🥉 Bronze',     desc: 'Score 60–74' },
  watch:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   label: '⚠ Watch List', desc: 'Score <60 or incidents' },
};

// ─── Radar Chart ──────────────────────────────────────────────────────────────

function RadarChart({ vendor }: { vendor: VendorScorecard }) {
  const cx = 80, cy = 80, r = 60;
  const metrics = [
    { label: 'ASN',      val: vendor.asn_coverage_rate },
    { label: 'On-Time',  val: vendor.on_time_delivery_rate },
    { label: 'Yield',    val: vendor.first_pass_yield },
    { label: 'Docs',     val: vendor.doc_currency_rate },
    { label: 'Barcode',  val: 100 - vendor.barcode_remediation_rate },
  ];
  const n = metrics.length;
  const toXY = (angle: number, pct: number) => {
    const rad = angle * (Math.PI / 180);
    return { x: cx + (r * pct / 100) * Math.sin(rad), y: cy - (r * pct / 100) * Math.cos(rad) };
  };
  const polygon = metrics.map((m, i) => {
    const { x, y } = toXY((i * 360) / n, m.val);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" aria-label="Performance radar chart">
      {[20, 40, 60, 80, 100].map(g => {
        const pts = metrics.map((_, i) => { const { x, y } = toXY((i * 360) / n, g); return `${x},${y}`; }).join(' ');
        return <polygon key={g} points={pts} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}
      {metrics.map((m, i) => {
        const { x, y } = toXY((i * 360) / n, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      <polygon points={polygon} fill="rgba(0,255,136,0.15)" stroke="#00ff88" strokeWidth="1.5" />
      {metrics.map((m, i) => {
        const { x, y } = toXY((i * 360) / n, 118);
        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="rgba(232,234,240,0.4)">{m.label}</text>;
      })}
    </svg>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 24, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" aria-label={`Score: ${score}`}>
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 30 30)"
        style={{ filter: `drop-shadow(0 0 4px ${color}60)` }} />
      <text x="30" y="34" textAnchor="middle" fill={color} fontSize="10" fontWeight="700">{score}</text>
    </svg>
  );
}

// ─── Metric Bar ───────────────────────────────────────────────────────────────

function MetricBar({ label, val, target, color, inverted = false }: {
  label: string; val: number; target: number; color: string; inverted?: boolean;
}) {
  const effective = inverted ? 100 - val : val;
  const pct = Math.min((effective / target) * 100, 100);
  const isGood = inverted ? val <= (100 - target) : val >= target;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
        <span>{label}</span>
        <span className={isGood ? 'text-[#00ff88]' : 'text-amber-400'}>
          {inverted ? `${val}% remed` : `${val}%`} {isGood ? '✓' : '⚠'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: isGood ? color : '#f59e0b' }} />
        </div>
        <span className="text-[10px] text-white/30 w-10 text-right">tgt {inverted ? `<${100 - target}` : `>${target}`}%</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorScorecardPage() {
  const { addNotification } = useNotifications();
  const [vendors, setVendors] = useState<VendorScorecard[]>([]);
  const [selected, setSelected] = useState<VendorScorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');

  const fetchScorecards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: VendorScorecard[] }>('/api/v1/reports/vendor-scorecards');
      const data = res.data ?? [];
      setVendors(data);
      if (data.length > 0 && !selected) setSelected(data[0]!);
    } catch {
      // Fall back to seed-based demo data so the page is usable in dev
      const demo: VendorScorecard[] = [
        { vendor_id: 'VND-001', vendor_name: 'Patanjali Foods Ltd', gstin: '27AABCT1234Z1Z1', compliance_status: 'Active', category: 'FMCG Food', asn_coverage_rate: 84, on_time_delivery_rate: 81, first_pass_yield: 88, doc_currency_rate: 100, barcode_remediation_rate: 7, total_deliveries: 96, total_asns: 81, last_delivery_at: new Date().toISOString(), incident_count: 1, composite_score: 87, tier: 'silver', trend: 'flat' },
        { vendor_id: 'VND-002', vendor_name: 'Amul Dairy Corp', gstin: '27AABCA5678Z1Z2', compliance_status: 'Active', category: 'Fresh Dairy', asn_coverage_rate: 78, on_time_delivery_rate: 72, first_pass_yield: 82, doc_currency_rate: 75, barcode_remediation_rate: 14, total_deliveries: 311, total_asns: 243, last_delivery_at: new Date().toISOString(), incident_count: 3, composite_score: 74, tier: 'watch', trend: 'down' },
        { vendor_id: 'VND-003', vendor_name: 'ITC Limited', gstin: '27AABCI9012Z1Z3', compliance_status: 'Active', category: 'FMCG Food', asn_coverage_rate: 97, on_time_delivery_rate: 94, first_pass_yield: 96, doc_currency_rate: 100, barcode_remediation_rate: 3, total_deliveries: 128, total_asns: 124, last_delivery_at: new Date().toISOString(), incident_count: 0, composite_score: 96, tier: 'gold', trend: 'up' },
        { vendor_id: 'VND-004', vendor_name: 'Britannia Industries', gstin: '27AABCB3456Z1Z4', compliance_status: 'Active', category: 'FMCG Food', asn_coverage_rate: 70, on_time_delivery_rate: 68, first_pass_yield: 79, doc_currency_rate: 94, barcode_remediation_rate: 18, total_deliveries: 87, total_asns: 61, last_delivery_at: new Date().toISOString(), incident_count: 2, composite_score: 71, tier: 'watch', trend: 'down' },
        { vendor_id: 'VND-005', vendor_name: 'HUL India', gstin: '27AABCH7890Z1Z5', compliance_status: 'Active', category: 'FMCG NonFood', asn_coverage_rate: 99, on_time_delivery_rate: 97, first_pass_yield: 98, doc_currency_rate: 100, barcode_remediation_rate: 1, total_deliveries: 214, total_asns: 212, last_delivery_at: new Date().toISOString(), incident_count: 0, composite_score: 98, tier: 'gold', trend: 'up' },
      ];
      setVendors(demo);
      if (!selected) setSelected(demo[0]!);
      addNotification('Showing demo scorecard data — connect to live API for real metrics', 'info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchScorecards(); }, [fetchScorecards]);

  const filtered = vendors.filter(v =>
    (tierFilter === 'all' || v.tier === tierFilter) &&
    (v.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
     v.category.toLowerCase().includes(search.toLowerCase()))
  );

  const tierCounts = {
    gold: vendors.filter(v => v.tier === 'gold').length,
    silver: vendors.filter(v => v.tier === 'silver').length,
    bronze: vendors.filter(v => v.tier === 'bronze').length,
    watch: vendors.filter(v => v.tier === 'watch').length,
  };

  if (!selected && !loading) return null;

  const tierCfg = selected ? TIER_CONFIG[selected.tier] : TIER_CONFIG.silver;

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Vendor Scorecard</h1>
          <p className="text-xs text-white/40 mt-0.5">Performance metrics · Compliance status · Tier classification</p>
        </div>
        <button onClick={fetchScorecards} className="btn-ghost text-xs">↻ Refresh</button>
      </div>

      {/* Tier summary */}
      <div className="grid grid-cols-4 gap-3">
        {(['gold', 'silver', 'bronze', 'watch'] as const).map(t => {
          const cfg = TIER_CONFIG[t];
          return (
            <button
              key={t}
              onClick={() => setTierFilter(f => f === t ? 'all' : t)}
              className={`card p-4 text-left transition-all hover:-translate-y-0.5 ${tierFilter === t ? `border` : ''}`}
              style={tierFilter === t ? { borderColor: cfg.border } : {}}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="text-xl font-bold" style={{ color: cfg.color }}>{loading ? '…' : tierCounts[t]}</span>
              </div>
              <p className="text-[9px] text-white/25">{cfg.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Vendor list */}
        <div className="space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="input-field text-xs w-full"
          />
          {loading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-white/20 text-sm">No vendors found</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(v => {
                const tc = TIER_CONFIG[v.tier];
                const isActive = selected?.vendor_id === v.vendor_id;
                return (
                  <button
                    key={v.vendor_id}
                    onClick={() => setSelected(v)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${isActive ? 'border-[#00ff88]/30 bg-[#00ff88]/5' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-white/80 truncate">{v.vendor_name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{tc.label}</span>
                        <span className="text-xs font-bold" style={{ color: tc.color }}>{v.composite_score}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-white/30">{v.category}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${v.composite_score}%`, background: tc.color }} />
                      </div>
                      <span className={`text-[9px] ${v.trend === 'up' ? 'text-green-400' : v.trend === 'down' ? 'text-red-400' : 'text-white/30'}`}>
                        {v.trend === 'up' ? '▲' : v.trend === 'down' ? '▼' : '→'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="lg:col-span-2 space-y-4">
            {/* Header */}
            <div className="card p-5" style={{ borderColor: tierCfg.border }}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <ScoreRing score={selected.composite_score} color={tierCfg.color} />
                  <div>
                    <h2 className="text-lg font-bold text-white">{selected.vendor_name}</h2>
                    <p className="text-xs text-white/40">{selected.category}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: tierCfg.bg, color: tierCfg.color, border: `1px solid ${tierCfg.border}` }}>
                        {tierCfg.label} Vendor
                      </span>
                      <span className="text-[10px] text-white/30 font-mono">{selected.gstin}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div>
                    <p className="text-[10px] text-white/30">Last Delivery</p>
                    <p className="text-sm font-bold text-white/80">
                      {selected.last_delivery_at
                        ? new Date(selected.last_delivery_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30">{selected.total_deliveries} deliveries</p>
                    {selected.incident_count > 0 && (
                      <p className="text-[10px] text-red-400 font-semibold">{selected.incident_count} incidents (30d)</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* KPIs + Radar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5 space-y-4">
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider">Performance KPIs</h3>
                <MetricBar label="ASN Coverage" val={selected.asn_coverage_rate} target={80} color="#00ff88" />
                <MetricBar label="On-Time Delivery" val={selected.on_time_delivery_rate} target={90} color="#3b82f6" />
                <MetricBar label="First-Pass Yield" val={selected.first_pass_yield} target={85} color="#a78bfa" />
                <MetricBar label="Doc Currency" val={selected.doc_currency_rate} target={100} color="#22c55e" />
                <MetricBar label="Barcode Remediation" val={selected.barcode_remediation_rate} target={90} color="#f59e0b" inverted />
              </div>
              <div className="card p-5">
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Performance Radar</h3>
                <div className="flex justify-center">
                  <RadarChart vendor={selected} />
                </div>
                {/* Score breakdown */}
                <div className="mt-3 space-y-1">
                  {[
                    { label: 'ASN Coverage (20%)', val: selected.asn_coverage_rate },
                    { label: 'On-Time (25%)', val: selected.on_time_delivery_rate },
                    { label: 'First-Pass (25%)', val: selected.first_pass_yield },
                    { label: 'Docs (15%)', val: selected.doc_currency_rate },
                    { label: 'Barcode (15%)', val: 100 - selected.barcode_remediation_rate },
                  ].map(m => (
                    <div key={m.label} className="flex items-center justify-between text-[9px]">
                      <span className="text-white/30">{m.label}</span>
                      <span className="text-white/50 font-mono">{m.val}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Compliance status */}
            <div className="card p-5">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Compliance Status</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Compliance Status', val: selected.compliance_status, ok: selected.compliance_status === 'Active' },
                  { label: 'Total Deliveries', val: String(selected.total_deliveries), ok: true },
                  { label: 'Incidents (30d)', val: String(selected.incident_count), ok: selected.incident_count === 0 },
                ].map(item => (
                  <div key={item.label} className={`p-3 rounded-lg border ${item.ok ? 'bg-green-500/5 border-green-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
                    <p className={`text-sm font-bold ${item.ok ? 'text-green-400' : 'text-red-400'}`}>{item.val}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => addNotification(`Scorecard report queued for ${selected.vendor_name}`, 'success')}
                className="btn-primary text-xs"
              >
                Send Report
              </button>
              <button
                onClick={() => addNotification(`Compliance alert sent to ${selected.vendor_name}`, 'warning')}
                className="btn-ghost text-xs"
              >
                Send Alert
              </button>
              {selected.tier === 'watch' && (
                <button
                  onClick={() => addNotification(`${selected.vendor_name} flagged for review`, 'error')}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                >
                  Flag for Review
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
