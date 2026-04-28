'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';

type StockState = 'Available' | 'Quarantined' | 'Held' | 'Rejected' | 'InTransit' | 'Disposed';

interface LedgerRow {
  sku_id: string;
  sku_code: string;
  name: string;
  category: string;
  is_ft: boolean;
  is_perishable: boolean;
  stock_state: StockState;
  quantity: number;
  last_updated: string;
}

interface SKUSummary {
  sku_id: string;
  sku_code: string;
  name: string;
  category: string;
  is_ft: boolean;
  is_perishable: boolean;
  Available: number;
  Quarantined: number;
  Held: number;
  Rejected: number;
  InTransit: number;
  Disposed: number;
  last_updated: string;
}

const STATE_COLORS: Record<StockState, string> = {
  Available:   '#00ff88',
  Quarantined: '#f59e0b',
  Held:        '#f97316',
  Rejected:    '#ef4444',
  InTransit:   '#3b82f6',
  Disposed:    '#6b7280',
};

function groupBySKU(rows: LedgerRow[]): SKUSummary[] {
  const map = new Map<string, SKUSummary>();
  for (const r of rows) {
    if (!map.has(r.sku_id)) {
      map.set(r.sku_id, {
        sku_id: r.sku_id, sku_code: r.sku_code, name: r.name,
        category: r.category, is_ft: r.is_ft, is_perishable: r.is_perishable,
        Available: 0, Quarantined: 0, Held: 0, Rejected: 0, InTransit: 0, Disposed: 0,
        last_updated: r.last_updated,
      });
    }
    const entry = map.get(r.sku_id)!;
    entry[r.stock_state] = Math.round(parseFloat(String(r.quantity)));
    if (r.last_updated > entry.last_updated) entry.last_updated = r.last_updated;
  }
  return Array.from(map.values());
}

function StockBar({ row }: { row: SKUSummary }) {
  const total = row.Available + row.Quarantined + row.Held + row.Rejected + row.InTransit + row.Disposed;
  if (total === 0) return <span className="text-[10px] text-white/25">—</span>;
  const segments: [StockState, number][] = [
    ['Available', row.Available], ['InTransit', row.InTransit],
    ['Quarantined', row.Quarantined], ['Held', row.Held],
    ['Rejected', row.Rejected], ['Disposed', row.Disposed],
  ];
  return (
    <div className="flex h-2 w-32 rounded-full overflow-hidden gap-px" title={`Total: ${total}`}>
      {segments.filter(([, v]) => v > 0).map(([state, val]) => (
        <div key={state} className="h-full"
          style={{ width: `${(val / total) * 100}%`, background: STATE_COLORS[state] }} />
      ))}
    </div>
  );
}

export default function InventoryPage() {
  const { addNotification } = useNotifications();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stateFilter, setStateFilter] = useState('All');
  const [selected, setSelected] = useState<SKUSummary | null>(null);
  const [total, setTotal] = useState(0);

  const fetchLedger = useCallback(async (searchTerm = '') => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (searchTerm) params.set('search', searchTerm);
      const res = await api.get<{ data: LedgerRow[]; total: number }>(`/api/v1/ledger/list?${params}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchLedger(search), 400);
    return () => clearTimeout(t);
  }, [search, fetchLedger]);

  const skus = groupBySKU(rows);
  const categories = ['All', ...Array.from(new Set(skus.map(r => r.category)))];

  const filtered = skus.filter(r => {
    const matchCat   = categoryFilter === 'All' || r.category === categoryFilter;
    const matchState = stateFilter === 'All' ||
      (stateFilter === 'Available'   && r.Available > 0) ||
      (stateFilter === 'Quarantined' && r.Quarantined > 0) ||
      (stateFilter === 'Held'        && r.Held > 0) ||
      (stateFilter === 'Rejected'    && r.Rejected > 0);
    return matchCat && matchState;
  });

  const totalAvailable   = skus.reduce((s, r) => s + r.Available, 0);
  const totalQuarantined = skus.reduce((s, r) => s + r.Quarantined, 0);
  const totalHeld        = skus.reduce((s, r) => s + r.Held, 0);
  const totalRejected    = skus.reduce((s, r) => s + r.Rejected, 0);

  const handleSyncSAP = async () => {
    try {
      await api.post('/api/v1/ledger/reconcile', {});
      addNotification('SAP reconciliation triggered — check alerts for discrepancies');
    } catch {
      addNotification('SAP sync failed — DB may be unavailable', 'warning');
    }
  };

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Inventory Ledger</h1>
          <p className="text-xs text-white/40 mt-0.5">
            Real-time stock states · {total} SKUs · Live from DB
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => addNotification('Exporting inventory to CSV...')} className="btn-ghost text-xs">Export CSV</button>
          <button onClick={handleSyncSAP} className="btn-primary text-xs">Sync SAP</button>
          <button onClick={() => fetchLedger(search)} className="btn-ghost text-xs">↻ Refresh</button>
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          ⚠ {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Available Units',   val: loading ? '…' : totalAvailable.toLocaleString(),   color: '#00ff88', icon: '✓' },
          { label: 'Quarantined',       val: loading ? '…' : totalQuarantined.toLocaleString(), color: '#f59e0b', icon: '⏸' },
          { label: 'Finance Held',      val: loading ? '…' : totalHeld.toLocaleString(),        color: '#f97316', icon: '⚠' },
          { label: 'Rejected',          val: loading ? '…' : totalRejected.toLocaleString(),    color: '#ef4444', icon: '✕' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search SKU or product name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field text-xs w-56"
        />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input-field text-xs w-40">
          {categories.map(c => <option key={c} className="bg-[#0d1117]">{c}</option>)}
        </select>
        {(['All', 'Available', 'Quarantined', 'Held', 'Rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setStateFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize font-semibold transition-all cursor-pointer ${stateFilter === f ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/70'}`}
          >
            {f === 'All' ? 'All States' : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="wms-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th className="whitespace-nowrap">SKU</th>
                <th className="whitespace-nowrap">Product</th>
                <th className="whitespace-nowrap">Category</th>
                <th className="whitespace-nowrap">Available</th>
                <th className="whitespace-nowrap">Quarantined</th>
                <th className="whitespace-nowrap">Held</th>
                <th className="whitespace-nowrap">In-Transit</th>
                <th className="whitespace-nowrap" style={{ minWidth: '128px' }}>Stock States</th>
                <th className="whitespace-nowrap">FT/NFT</th>
                <th className="whitespace-nowrap">Last GRN</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="text-center text-white/30 text-xs py-8">Loading inventory…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center text-white/30 text-xs py-8">No inventory records found</td></tr>
              )}
              {!loading && filtered.map(row => {
                const hasIssue = row.Quarantined > 0 || row.Held > 0 || row.Rejected > 0;
                return (
                  <tr
                    key={row.sku_id}
                    className={`cursor-pointer ${hasIssue ? 'bg-amber-500/[0.02]' : ''}`}
                    onClick={() => setSelected(row)}
                  >
                    <td><span className="font-mono text-[10px] text-white/60 whitespace-nowrap">{row.sku_code}</span></td>
                    <td style={{ maxWidth: '160px' }}>
                      <p className="text-xs text-white/80 font-medium truncate" style={{ maxWidth: '150px' }}>{row.name}</p>
                      <p className="text-[10px] text-white/30">{row.is_perishable ? '🌡 Perishable' : 'Ambient'}</p>
                    </td>
                    <td><span className="text-[10px] text-white/50 whitespace-nowrap">{row.category}</span></td>
                    <td><span className={`text-xs font-bold ${row.Available > 0 ? 'text-[#00ff88]' : 'text-white/20'}`}>{row.Available > 0 ? row.Available.toLocaleString() : '—'}</span></td>
                    <td><span className={`text-xs font-bold ${row.Quarantined > 0 ? 'text-amber-400' : 'text-white/20'}`}>{row.Quarantined > 0 ? row.Quarantined : '—'}</span></td>
                    <td><span className={`text-xs font-bold ${row.Held > 0 ? 'text-orange-400' : 'text-white/20'}`}>{row.Held > 0 ? row.Held : '—'}</span></td>
                    <td><span className={`text-xs ${row.InTransit > 0 ? 'text-blue-400' : 'text-white/20'}`}>{row.InTransit > 0 ? row.InTransit : '—'}</span></td>
                    <td style={{ minWidth: '128px' }}><StockBar row={row} /></td>
                    <td className="whitespace-nowrap">
                      <span className={`status-pill text-[9px] ${row.is_ft ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                        {row.is_ft ? 'FT' : 'NFT'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="text-[10px] text-white/30 font-mono">
                        {new Date(row.last_updated).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <button onClick={e => { e.stopPropagation(); setSelected(row); }} className="text-[10px] text-[#00ff88]/50 hover:text-[#00ff88] font-bold tracking-wider cursor-pointer">
                        DETAIL →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-white/30">
        <span className="font-semibold text-white/40">Stock State Legend:</span>
        {(Object.entries(STATE_COLORS) as [StockState, string][]).map(([state, color]) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />{state}
          </span>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg card p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="font-mono text-xs text-white/40 mb-1">{selected.sku_code}</p>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-white/30">{selected.category}</span>
                  <span className={`status-pill text-[9px] ${selected.is_ft ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                    {selected.is_ft ? 'FT' : 'NFT'}
                  </span>
                  {selected.is_perishable && <span className="status-pill text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">Perishable</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white/60 text-xl cursor-pointer">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {([
                { label: 'Available',   val: selected.Available,   color: '#00ff88' },
                { label: 'Quarantined', val: selected.Quarantined, color: '#f59e0b' },
                { label: 'Held',        val: selected.Held,        color: '#f97316' },
                { label: 'Rejected',    val: selected.Rejected,    color: '#ef4444' },
                { label: 'In-Transit',  val: selected.InTransit,   color: '#3b82f6' },
                { label: 'Disposed',    val: selected.Disposed,    color: '#6b7280' },
              ] as {label: string; val: number; color: string}[]).map(s => (
                <div key={s.label} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                  <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                  <p className="text-xl font-bold" style={{ color: s.val > 0 ? s.color : 'rgba(255,255,255,0.15)' }}>{s.val.toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="mb-2">
              <StockBar row={selected} />
            </div>
            <p className="text-[10px] text-white/30 mb-5">
              Total on ledger: {(selected.Available + selected.Quarantined + selected.Held + selected.Rejected + selected.InTransit + selected.Disposed).toLocaleString()} units
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => { addNotification(`Quarantine initiated for ${selected.sku_code}`, 'warning'); setSelected(null); }}
                className="btn-danger flex-1 text-xs"
              >
                Move to Quarantine
              </button>
              <button
                onClick={() => { addNotification(`Chain of custody report generated for ${selected.sku_code}`); setSelected(null); }}
                className="btn-ghost flex-1 text-xs"
              >
                Chain of Custody
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
