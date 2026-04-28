'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';

type Tab = 'vendors' | 'skus';
type TrustTier = 'gold' | 'silver' | 'bronze';

interface Vendor {
  vendor_id: string;
  vendor_code: string;
  name: string;
  gstin: string;
  compliance_status: string;
  // Synthetic fields for UI
  tier: TrustTier;
  score: number;
  asns: number;
  accuracy: number;
  lastDelivery: string;
  category: string;
}

interface SKU {
  sku_id: string;
  sku_code: string;
  name: string;
  category: string;
  packaging_class: string;
  is_ft: boolean;
  status: string;
  mrp: number;
  gst_rate: number;
}

const TIER_CONFIG = {
  gold:   { color: '#00ff88', bg: 'bg-[#00ff88]/10', border: 'border-[#00ff88]/25', text: 'text-[#00ff88]', label: '🥇 Gold', desc: 'ASN coverage >90%, accuracy >97% — 10% QC sample' },
  silver: { color: '#94a3b8', bg: 'bg-slate-500/10', border: 'border-slate-500/25', text: 'text-slate-300', label: '🥈 Silver', desc: 'ASN coverage 70-90%, accuracy 90-97% — 30% QC sample' },
  bronze: { color: '#f97316', bg: 'bg-orange-500/10', border: 'border-orange-500/25', text: 'text-orange-400', label: '🥉 Bronze', desc: 'ASN coverage <70% or accuracy <90% — 100% QC sample' },
};

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-white/70 w-8 text-right">{score}</span>
    </div>
  );
}

export default function MasterDataPage() {
  const { addNotification } = useNotifications();
  const [tab, setTab] = useState<Tab>('vendors');
  const [search, setSearch] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [tierFilter, setTierFilter] = useState<TrustTier | 'all'>('all');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      if (tab === 'vendors') {
        const res = await api.get<{ data: any[] }>('/api/v1/vendors');
        // Map backend rows to UI model with synthetic data for now
        const mapped = (res.data ?? []).map(v => ({
          ...v,
          tier: v.compliance_status === 'Active' ? 'gold' : 'bronze',
          score: v.compliance_status === 'Active' ? 92 : 45,
          asns: 124,
          accuracy: 98.5,
          lastDelivery: '2026-04-27',
          category: 'FMCG Food',
        }));
        setVendors(mapped);
        if (mapped.length > 0 && !selectedVendor) setSelectedVendor(mapped[0]);
      } else {
        const res = await api.get<{ data: any[] }>('/api/v1/skus');
        setSkus(res.data ?? []);
      }
    } catch (err) {
      addNotification('Failed to fetch master data', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, addNotification]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredVendors = vendors.filter(v =>
    (tierFilter === 'all' || v.tier === tierFilter) &&
    (v.name.toLowerCase().includes(search.toLowerCase()) || v.vendor_code.includes(search))
  );

  const filteredSKUs = skus.filter(s =>
    s.sku_code.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const tierCounts = {
    gold: vendors.filter(v => v.tier === 'gold').length,
    silver: vendors.filter(v => v.tier === 'silver').length,
    bronze: vendors.filter(v => v.tier === 'bronze').length
  };

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Master Data</h1>
          <p className="text-xs text-white/40 mt-0.5">Vendor trust tiers · SKU catalogue · Compliance rules</p>
        </div>
        <button onClick={fetchData} className="btn-ghost text-xs">↻ REFRESH</button>
      </div>

      {/* Trust Tier Summary */}
      <div className="grid grid-cols-3 gap-3">
        {(['gold', 'silver', 'bronze'] as TrustTier[]).map(t => {
          const cfg = TIER_CONFIG[t];
          return (
            <button key={t} onClick={() => setTierFilter(f => f === t ? 'all' : t)} className={`card p-4 text-left transition-all hover:-translate-y-0.5 ${tierFilter === t ? `border ${cfg.border}` : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
                <span className={`text-xl font-bold ${cfg.text}`}>{loading ? '…' : tierCounts[t]}</span>
              </div>
              <p className="text-[10px] text-white/30 leading-relaxed">{cfg.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['vendors', 'skus'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setSearch(''); setSelectedVendor(null); }} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${tab === t ? 'bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/25' : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/60'}`}>
              {t === 'vendors' ? 'Vendors' : 'SKU Catalogue'}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'vendors' ? 'Search vendor code or name…' : 'Search SKU code or name…'} className="input-field text-xs w-64" />
      </div>

      {loading && <div className="text-center py-12 text-white/20 text-sm">Loading master data…</div>}

      {!loading && tab === 'vendors' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 space-y-2">
            {filteredVendors.length === 0 && <div className="text-center py-8 text-white/10">No vendors found</div>}
            {filteredVendors.map(v => {
              const tier = TIER_CONFIG[v.tier];
              return (
                <button key={v.vendor_id} onClick={() => setSelectedVendor(v)} className={`w-full text-left card p-4 transition-all hover:border-white/15 ${selectedVendor?.vendor_id === v.vendor_id ? 'border-[#00ff88]/20 bg-[#00ff88]/[0.02]' : ''}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{v.name}</p>
                      <p className="text-[10px] font-mono text-white/40 mt-0.5">{v.vendor_code}</p>
                    </div>
                    <span className={`status-pill text-[9px] flex-shrink-0 ${tier.bg} ${tier.text} border ${tier.border}`}>{tier.label}</span>
                  </div>
                  <ScoreBar score={v.score} color={tier.color} />
                  <div className="flex items-center justify-between mt-2">
                    <span className={`status-pill text-[9px] ${v.compliance_status === 'Active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>{v.compliance_status}</span>
                    <span className="text-[10px] text-white/30">{v.category}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-3">
            {selectedVendor ? (() => {
              const tier = TIER_CONFIG[selectedVendor.tier];
              return (
                <div className="card p-6 space-y-5 animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-base font-bold text-white">{selectedVendor.name}</h2>
                      <p className="text-[10px] font-mono text-white/40 mt-0.5">{selectedVendor.vendor_code} · {selectedVendor.gstin}</p>
                    </div>
                    <span className={`status-pill text-[10px] ${selectedVendor.compliance_status === 'Active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>{selectedVendor.compliance_status}</span>
                  </div>

                  <div className={`p-4 rounded-xl border ${tier.border} ${tier.bg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className={`text-sm font-bold ${tier.text}`}>{tier.label} Vendor</p>
                        <p className="text-[10px] text-white/40 mt-0.5">{tier.desc}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${tier.text}`}>{selectedVendor.score}</p>
                        <p className="text-[10px] text-white/30">Trust Score</p>
                      </div>
                    </div>
                    <ScoreBar score={selectedVendor.score} color={tier.color} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[{ l: 'Total ASNs', v: `${selectedVendor.asns}` }, { l: 'GRN Accuracy', v: `${selectedVendor.accuracy}%` }, { l: 'Last Delivery', v: selectedVendor.lastDelivery }].map(r => (
                      <div key={r.l} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                        <p className="text-[10px] text-white/30 mb-0.5">{r.l}</p>
                        <p className="text-xs font-bold text-white/80">{r.v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[{ l: 'Vendor ID', v: selectedVendor.vendor_id }, { l: 'Category', v: selectedVendor.category }].map(r => (
                      <div key={r.l} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                        <p className="text-[10px] text-white/30 mb-0.5">{r.l}</p>
                        <p className="text-xs font-mono text-white/80">{r.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : <div className="card p-12 text-center text-white/30 text-sm">Select a vendor</div>}
          </div>
        </div>
      )}

      {!loading && tab === 'skus' && (
        <div className="card overflow-hidden">
          <table className="wms-table">
            <thead>
              <tr><th>SKU Code</th><th>Description</th><th>Category</th><th>Packaging</th><th>MRP</th><th>GST</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filteredSKUs.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-white/10">No SKUs found</td></tr>}
              {filteredSKUs.map(s => (
                <tr key={s.sku_id}>
                  <td><span className="font-mono text-[10px] text-[#00ff88]/80">{s.sku_code}</span></td>
                  <td><span className="text-xs text-white/70">{s.name}</span></td>
                  <td><span className="text-xs text-white/50">{s.category}</span></td>
                  <td><span className="text-xs text-white/50">{s.packaging_class}</span></td>
                  <td><span className="text-xs text-white/60">₹{s.mrp}</span></td>
                  <td><span className="text-xs text-white/60">{s.gst_rate}%</span></td>
                  <td>
                    <span className={`status-pill text-[9px] ${s.status === 'Active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
