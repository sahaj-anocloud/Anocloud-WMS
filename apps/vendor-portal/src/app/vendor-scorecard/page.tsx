'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/notifications';

interface Vendor {
  id: string; name: string; category: string; gstin: string; compliance: number;
  asnCoverage: number; onTimeDelivery: number; firstPassYield: number; barcodeRemed: number;
  totalDeliveries: number; openPOs: number; lastDelivery: string;
  docStatus: { gst: boolean; fssai: boolean; pan: boolean; trade: boolean };
  score: number; trend: 'up' | 'down' | 'flat'; tier: 'gold' | 'silver' | 'bronze' | 'watch';
}

const VENDORS: Vendor[] = [
  { id: 'VND-001', name: 'ITC Limited', category: 'FMCG / Tobacco', gstin: '29AAACI1681G1ZK', compliance: 100, asnCoverage: 97, onTimeDelivery: 94, firstPassYield: 96, barcodeRemed: 3, totalDeliveries: 128, openPOs: 4, lastDelivery: '27 Apr', docStatus: { gst: true, fssai: true, pan: true, trade: true }, score: 96, trend: 'up', tier: 'gold' },
  { id: 'VND-002', name: 'Hindustan Unilever', category: 'BDF / Personal Care', gstin: '27AAACH0088E1ZI', compliance: 100, asnCoverage: 99, onTimeDelivery: 97, firstPassYield: 98, barcodeRemed: 1, totalDeliveries: 214, openPOs: 7, lastDelivery: '27 Apr', docStatus: { gst: true, fssai: true, pan: true, trade: true }, score: 98, trend: 'up', tier: 'gold' },
  { id: 'VND-003', name: 'Patanjali Foods', category: 'FMCG Food / Edible Oil', gstin: '05AADCP5261H1Z2', compliance: 100, asnCoverage: 84, onTimeDelivery: 81, firstPassYield: 88, barcodeRemed: 7, totalDeliveries: 96, openPOs: 3, lastDelivery: '27 Apr', docStatus: { gst: true, fssai: true, pan: true, trade: true }, score: 87, trend: 'flat', tier: 'silver' },
  { id: 'VND-004', name: 'Amul Dairy (GCMMF)', category: 'Fresh / Dairy', gstin: '24AAACG0634G1ZY', compliance: 100, asnCoverage: 78, onTimeDelivery: 72, firstPassYield: 82, barcodeRemed: 14, totalDeliveries: 311, openPOs: 9, lastDelivery: '27 Apr', docStatus: { gst: true, fssai: true, pan: true, trade: false }, score: 74, trend: 'down', tier: 'watch' },
  { id: 'VND-005', name: 'Britannia Industries', category: 'FMCG Food / Biscuits', gstin: '29AAACB1586N1ZA', compliance: 94, asnCoverage: 70, onTimeDelivery: 68, firstPassYield: 79, barcodeRemed: 18, totalDeliveries: 87, openPOs: 2, lastDelivery: '26 Apr', docStatus: { gst: true, fssai: true, pan: true, trade: false }, score: 71, trend: 'down', tier: 'watch' },
  { id: 'VND-006', name: 'Nestle India', category: 'FMCG Food / Beverages', gstin: '07AAACN0006C1Z6', compliance: 100, asnCoverage: 91, onTimeDelivery: 88, firstPassYield: 93, barcodeRemed: 4, totalDeliveries: 152, openPOs: 5, lastDelivery: '25 Apr', docStatus: { gst: true, fssai: true, pan: true, trade: true }, score: 92, trend: 'up', tier: 'silver' },
];

const TIER_CONFIG = {
  gold:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'Gold' },
  silver: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', label: 'Silver' },
  bronze: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)', border: 'rgba(205,127,50,0.25)', label: 'Bronze' },
  watch:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: 'Watch List' },
};

/* Radar Chart */
function RadarChart({ vendor }: { vendor: Vendor }) {
  const cx = 80, cy = 80, r = 60;
  const metrics = [
    { label: 'ASN', val: vendor.asnCoverage },
    { label: 'On-Time', val: vendor.onTimeDelivery },
    { label: 'Yield', val: vendor.firstPassYield },
    { label: 'Compliance', val: vendor.compliance },
    { label: 'Barcode', val: 100 - vendor.barcodeRemed },
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
  const grid = [20, 40, 60, 80, 100];

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      {/* Grid rings */}
      {grid.map(g => {
        const pts = metrics.map((_, i) => {
          const { x, y } = toXY((i * 360) / n, g);
          return `${x},${y}`;
        }).join(' ');
        return <polygon key={g} points={pts} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}
      {/* Axes */}
      {metrics.map((m, i) => {
        const { x, y } = toXY((i * 360) / n, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon points={polygon} className="radar-polygon" />
      {/* Labels */}
      {metrics.map((m, i) => {
        const { x, y } = toXY((i * 360) / n, 118);
        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="rgba(232,234,240,0.4)">{m.label}</text>;
      })}
    </svg>
  );
}

/* Score ring */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 24, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 30 30)"
        style={{ filter: `drop-shadow(0 0 4px ${color}60)` }} />
      <text x="30" y="34" textAnchor="middle" fill={color} fontSize="10" fontWeight="700">{score}</text>
    </svg>
  );
}

function MetricBar({ val, target, color }: { val: number; target: number; color: string }) {
  const pct = Math.min((val / target) * 100, 100);
  const isGood = val >= target;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: isGood ? color : '#f59e0b' }} />
      </div>
      <span className="text-[10px] font-bold w-7 text-right" style={{ color: isGood ? color : '#f59e0b' }}>{val}%</span>
    </div>
  );
}

export default function VendorScorecardPage() {
  const { addNotification } = useNotifications();
  const [selected, setSelected] = useState<Vendor>(VENDORS[0]);
  const [search, setSearch] = useState('');

  const filtered = VENDORS.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.category.toLowerCase().includes(search.toLowerCase())
  );

  const tierCfg = TIER_CONFIG[selected.tier];

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Vendor Scorecard</h1>
          <p className="text-xs text-white/40 mt-0.5">Performance metrics · Compliance status · Tier classification</p>
        </div>
        <button onClick={() => addNotification('Exporting scorecards to PDF...')} className="btn-ghost text-xs">Export PDF</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Vendor list */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search vendors..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field text-xs w-full"
          />
          <div className="space-y-2">
            {filtered.map(v => {
              const tc = TIER_CONFIG[v.tier];
              const isActive = selected.id === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelected(v)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${isActive ? 'border-[#00ff88]/30 bg-[#00ff88]/5' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-xs font-bold ${isActive ? 'text-white' : 'text-white/70'}`}>{v.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                        {tc.label}
                      </span>
                      <span className="text-xs font-bold" style={{ color: tc.color }}>{v.score}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/30">{v.category}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${v.score}%`, background: tc.color }} />
                    </div>
                    <span className={`text-[9px] ${v.trend === 'up' ? 'text-green-400' : v.trend === 'down' ? 'text-red-400' : 'text-white/30'}`}>
                      {v.trend === 'up' ? '▲' : v.trend === 'down' ? '▼' : '→'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header card */}
          <div className="card p-5" style={{ borderColor: tierCfg.border }}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <ScoreRing score={selected.score} color={tierCfg.color} />
                <div>
                  <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                  <p className="text-xs text-white/40">{selected.category}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: tierCfg.bg, color: tierCfg.color, border: `1px solid ${tierCfg.border}` }}>
                      {tierCfg.label} Vendor
                    </span>
                    <span className="text-[10px] text-white/30">GSTIN: {selected.gstin}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/30">Last Delivery</p>
                <p className="text-sm font-bold text-white/80">{selected.lastDelivery}</p>
                <p className="text-[10px] text-white/30 mt-1">{selected.totalDeliveries} total deliveries</p>
              </div>
            </div>
          </div>

          {/* Metrics + Radar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4">Performance KPIs</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                    <span>ASN Coverage</span><span>Target &gt;80%</span>
                  </div>
                  <MetricBar val={selected.asnCoverage} target={80} color="#00ff88" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                    <span>On-Time Delivery</span><span>Target &gt;90%</span>
                  </div>
                  <MetricBar val={selected.onTimeDelivery} target={90} color="#3b82f6" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                    <span>First-Pass Yield</span><span>Target &gt;85%</span>
                  </div>
                  <MetricBar val={selected.firstPassYield} target={85} color="#a78bfa" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                    <span>Barcode Remed. Rate</span><span>Target &lt;10%</span>
                  </div>
                  <MetricBar val={100 - selected.barcodeRemed} target={90} color="#f59e0b" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                    <span>Compliance Score</span><span>Target 100%</span>
                  </div>
                  <MetricBar val={selected.compliance} target={100} color="#22c55e" />
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Performance Radar</h3>
              <div className="flex justify-center">
                <RadarChart vendor={selected} />
              </div>
            </div>
          </div>

          {/* Document status */}
          <div className="card p-5">
            <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4">Compliance Documents</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { key: 'gst', label: 'GST Registration' },
                { key: 'fssai', label: 'FSSAI License' },
                { key: 'pan', label: 'PAN Card' },
                { key: 'trade', label: 'Trade License' },
              ] as const).map(doc => {
                const ok = selected.docStatus[doc.key as keyof typeof selected.docStatus];
                return (
                  <div key={doc.key} className={`p-3 rounded-lg border ${ok ? 'bg-green-500/5 border-green-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-sm ${ok ? 'text-green-400' : 'text-red-400'}`}>{ok ? '✓' : '✕'}</span>
                      <span className={`text-[10px] font-bold ${ok ? 'text-green-400' : 'text-red-400'}`}>{ok ? 'Active' : 'Missing'}</span>
                    </div>
                    <p className="text-[10px] text-white/40">{doc.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => addNotification(`Scorecard report sent to ${selected.name}`)} className="btn-primary text-xs">Send Report</button>
            <button onClick={() => addNotification(`Compliance alert sent to ${selected.name}`, 'warning')} className="btn-ghost text-xs">Send Alert</button>
            {selected.tier === 'watch' && (
              <button onClick={() => addNotification(`${selected.name} flagged for review`, 'error')} className="btn-danger text-xs">Flag for Review</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
