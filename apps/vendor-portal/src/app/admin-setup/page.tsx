'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';

type Tab = 'vendor' | 'sku' | 'po';

const SKU_CATEGORIES = [
  'FMCG_Food',
  'FMCG_NonFood',
  'BDF',
  'Fresh_FV',
  'Fresh_Dairy',
  'Frozen',
  'Staples',
  'Chocolate',
  'Pharma',
  'General_Merchandise',
];

const PACKAGING_CLASSES = [
  'SealedCarton', 'GunnyBag', 'Crate', 'Pallet',
  'LoosePack', 'Bottle', 'Pouch',
];

/* ─── Vendor Form ─────────────────────────────────────────────── */
function VendorForm() {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    vendor_code: '',
    name: '',
    gstin: '',
    dc_id: 'DC-BLR-01',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendor_code || !form.name || !form.gstin) {
      addNotification('All fields are required', 'error');
      return;
    }
    if (form.gstin.length !== 15) {
      addNotification('GSTIN must be exactly 15 characters', 'error');
      return;
    }
    try {
      setLoading(true);
      const res = await api.post<{ vendor_id: string; name: string }>('/api/v1/vendors', form);
      addNotification(`Vendor "${res.name}" created successfully`, 'success');
      setForm({ vendor_code: '', name: '', gstin: '', dc_id: 'DC-BLR-01' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create vendor';
      addNotification(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl" suppressHydrationWarning>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Vendor Code *</label>
          <input
            value={form.vendor_code}
            onChange={set('vendor_code')}
            placeholder="e.g. VND-010"
            className="input-field w-full font-mono"
            suppressHydrationWarning
          />
          <p className="text-[10px] text-white/20">Unique code, e.g. VND-010</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">DC / Warehouse *</label>
          <input
            value={form.dc_id}
            onChange={set('dc_id')}
            placeholder="DC-BLR-01"
            className="input-field w-full font-mono"
            suppressHydrationWarning
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Vendor / Company Name *</label>
        <input
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. Nestle India Ltd"
          className="input-field w-full"
          suppressHydrationWarning
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">GSTIN *</label>
        <input
          value={form.gstin}
          onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
          placeholder="e.g. 27AABCN1234Z1Z5"
          maxLength={15}
          className="input-field w-full font-mono tracking-widest"
          suppressHydrationWarning
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/20">15-character GST Identification Number</p>
          <span className={`text-[10px] font-mono ${form.gstin.length === 15 ? 'text-[#00ff88]' : 'text-white/30'}`}>
            {form.gstin.length}/15
          </span>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/15">
        <p className="text-[10px] text-blue-400/70 leading-relaxed">
          After creating the vendor, they can log in as <span className="font-mono text-blue-300">Vendor User</span> and
          submit ASNs against POs assigned to them. Activate the vendor from Master Data after document verification.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating Vendor…' : '+ Create Vendor'}
      </button>
    </form>
  );
}

/* ─── SKU Form ────────────────────────────────────────────────── */
function SKUForm() {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    sku_code: '',
    name: '',
    category: 'FMCG_Food',
    packaging_class: 'SealedCarton',
    gst_rate: '',
    mrp: '',
    barcode: '',
    dc_id: 'DC-BLR-01',
    is_ft: false,
    is_perishable: false,
    requires_cold: false,
  });

  const setStr = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setBool = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.checked }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku_code || !form.name || !form.gst_rate || !form.mrp) {
      addNotification('SKU Code, Name, GST Rate and MRP are required', 'error');
      return;
    }
    try {
      setLoading(true);
      const payload: Record<string, unknown> = {
        dc_id: form.dc_id,
        sku_code: form.sku_code,
        name: form.name,
        category: form.category,
        packaging_class: form.packaging_class,
        gst_rate: parseFloat(form.gst_rate),
        mrp: parseFloat(form.mrp),
        is_ft: form.is_ft,
        is_perishable: form.is_perishable,
        requires_cold: form.requires_cold,
      };
      if (form.barcode) {
        payload.barcodes = [{ barcode: form.barcode, barcode_type: 'EAN13', is_primary: true }];
      }
      const res = await api.post<{ sku_id: string; name: string; status: string }>('/api/v1/skus', payload);
      addNotification(`SKU "${res.name}" created — Status: ${res.status}`, 'success');
      setForm({
        sku_code: '', name: '', category: 'FMCG_Food', packaging_class: 'SealedCarton',
        gst_rate: '', mrp: '', barcode: '', dc_id: 'DC-BLR-01',
        is_ft: false, is_perishable: false, requires_cold: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create SKU';
      addNotification(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">SKU Code *</label>
          <input
            value={form.sku_code}
            onChange={setStr('sku_code')}
            placeholder="e.g. SKU-NOODLE-001"
            className="input-field w-full font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">DC / Warehouse</label>
          <input
            value={form.dc_id}
            onChange={setStr('dc_id')}
            className="input-field w-full font-mono"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Product Name *</label>
        <input
          value={form.name}
          onChange={setStr('name')}
          placeholder="e.g. Maggi Noodles 70g"
          className="input-field w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Category *</label>
          <select value={form.category} onChange={setStr('category')} className="input-field w-full">
            {SKU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Packaging Class *</label>
          <select value={form.packaging_class} onChange={setStr('packaging_class')} className="input-field w-full">
            {PACKAGING_CLASSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">GST Rate (%) *</label>
          <input
            type="number"
            value={form.gst_rate}
            onChange={setStr('gst_rate')}
            placeholder="e.g. 18"
            min="0" max="28" step="0.01"
            className="input-field w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">MRP (₹) *</label>
          <input
            type="number"
            value={form.mrp}
            onChange={setStr('mrp')}
            placeholder="e.g. 15"
            min="0" step="0.01"
            className="input-field w-full"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Primary Barcode (EAN13)</label>
        <input
          value={form.barcode}
          onChange={setStr('barcode')}
          placeholder="e.g. 8901234567890"
          maxLength={13}
          className="input-field w-full font-mono tracking-widest"
        />
        <p className="text-[10px] text-white/20">Optional — can be added later via barcode management</p>
      </div>

      {/* Flags */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Product Flags</p>
        {[
          { key: 'is_ft', label: 'Fast Track (FT)', desc: 'Priority unloading and receiving' },
          { key: 'is_perishable', label: 'Perishable', desc: 'Triggers 30-min dwell timer alert' },
          { key: 'requires_cold', label: 'Cold Chain Required', desc: 'Must be stored in cold dock zone' },
        ].map(flag => (
          <label key={flag.key} className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={form[flag.key as keyof typeof form] as boolean}
                onChange={setBool(flag.key as keyof typeof form)}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded border transition-all ${
                form[flag.key as keyof typeof form]
                  ? 'bg-[#00ff88] border-[#00ff88]'
                  : 'bg-transparent border-white/20 group-hover:border-white/40'
              } flex items-center justify-center`}>
                {form[flag.key as keyof typeof form] && (
                  <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-white/70">{flag.label}</p>
              <p className="text-[10px] text-white/30">{flag.desc}</p>
            </div>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating SKU…' : '+ Create SKU'}
      </button>
    </form>
  );
}

/* ─── PO Injection Form ───────────────────────────────────────── */
function POForm() {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    sap_po_number: '',
    dc_id: 'DC-BLR-01',
    vendor_id: '',
    sku_id: '',
    ordered_qty: '',
    unit_price: '',
    gst_rate: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sap_po_number || !form.vendor_id || !form.sku_id || !form.ordered_qty || !form.unit_price) {
      addNotification('All fields except GST Rate are required', 'error');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        sap_po_number: form.sap_po_number,
        dc_id: form.dc_id,
        vendor_id: form.vendor_id,
        lines: [{
          sku_id: form.sku_id,
          ordered_qty: parseFloat(form.ordered_qty),
          unit_price: parseFloat(form.unit_price),
          gst_rate: parseFloat(form.gst_rate || '0'),
        }],
      };
      await api.post('/internal/sap/po-sync', payload);
      addNotification(`PO "${form.sap_po_number}" injected successfully — vendors can now create ASNs`, 'success');
      setForm({ sap_po_number: '', dc_id: 'DC-BLR-01', vendor_id: '', sku_id: '', ordered_qty: '', unit_price: '', gst_rate: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to inject PO';
      addNotification(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
        <p className="text-[10px] text-amber-400/80 leading-relaxed">
          In production, SAP pushes POs automatically. Use this form to manually inject a PO for testing
          or when SAP integration is not yet live. You need the <span className="font-mono text-amber-300">vendor_id</span> and{' '}
          <span className="font-mono text-amber-300">sku_id</span> UUIDs from the database.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">PO Number *</label>
          <input
            value={form.sap_po_number}
            onChange={set('sap_po_number')}
            placeholder="e.g. PO-99001"
            className="input-field w-full font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">DC / Warehouse *</label>
          <input
            value={form.dc_id}
            onChange={set('dc_id')}
            className="input-field w-full font-mono"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Vendor ID (UUID) *</label>
        <input
          value={form.vendor_id}
          onChange={set('vendor_id')}
          placeholder="Paste vendor UUID from Master Data"
          className="input-field w-full font-mono text-xs"
        />
        <p className="text-[10px] text-white/20">Go to Master Data → Vendors → copy the Vendor ID</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">SKU ID (UUID) *</label>
        <input
          value={form.sku_id}
          onChange={set('sku_id')}
          placeholder="Paste SKU UUID from Master Data"
          className="input-field w-full font-mono text-xs"
        />
        <p className="text-[10px] text-white/20">Go to Master Data → SKU Catalogue → copy the SKU ID</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Ordered Qty *</label>
          <input
            type="number"
            value={form.ordered_qty}
            onChange={set('ordered_qty')}
            placeholder="500"
            min="1"
            className="input-field w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Unit Price (₹) *</label>
          <input
            type="number"
            value={form.unit_price}
            onChange={set('unit_price')}
            placeholder="100.00"
            min="0" step="0.01"
            className="input-field w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">GST Rate (%)</label>
          <input
            type="number"
            value={form.gst_rate}
            onChange={set('gst_rate')}
            placeholder="18"
            min="0" max="28" step="0.01"
            className="input-field w-full"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Injecting PO…' : '→ Inject PO into WMS'}
      </button>
    </form>
  );
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function AdminSetupPage() {
  const [tab, setTab] = useState<Tab>('vendor');

  const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
    { id: 'vendor', label: 'Create Vendor', icon: '🏭', desc: 'Register a new supplier' },
    { id: 'sku',    label: 'Create SKU',    icon: '📦', desc: 'Add product to catalogue' },
    { id: 'po',     label: 'Inject PO',     icon: '📄', desc: 'Simulate SAP PO push' },
  ];

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[900px]" suppressHydrationWarning>
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Admin Setup</h1>
        <p className="text-xs text-white/40 mt-0.5">
          One-time configuration — create vendors, SKUs, and inject POs before operations begin
        </p>
      </div>

      {/* Setup Order Guide */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { step: '1', label: 'Create Vendors', desc: 'Register all suppliers with GSTIN', color: 'text-[#00ff88]', border: 'border-[#00ff88]/20', bg: 'bg-[#00ff88]/5' },
          { step: '2', label: 'Create SKUs', desc: 'Add all products to the catalogue', color: 'text-[#3b82f6]', border: 'border-[#3b82f6]/20', bg: 'bg-[#3b82f6]/5' },
          { step: '3', label: 'Inject POs', desc: 'Push Purchase Orders into WMS', color: 'text-[#f59e0b]', border: 'border-[#f59e0b]/20', bg: 'bg-[#f59e0b]/5' },
        ].map(s => (
          <div key={s.step} className={`card p-4 border ${s.border} ${s.bg}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-lg font-black ${s.color}`}>{s.step}</span>
              <span className="text-xs font-bold text-white/70">{s.label}</span>
            </div>
            <p className="text-[10px] text-white/30">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
              tab === t.id
                ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/25'
                : 'bg-white/[0.03] text-white/40 border-white/[0.06] hover:text-white/60 hover:border-white/10'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Form Panel */}
      <div className="card p-6">
        <div className="mb-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">
            {TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}
          </h2>
          <p className="text-[10px] text-white/30 mt-0.5">
            {TABS.find(t => t.id === tab)?.desc}
          </p>
        </div>

        {tab === 'vendor' && <VendorForm />}
        {tab === 'sku'    && <SKUForm />}
        {tab === 'po'     && <POForm />}
      </div>

      {/* Quick Reference */}
      <div className="card p-5 space-y-3">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Quick Reference — Existing Seed Data</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-white/30 mb-2">Vendors</p>
            <div className="space-y-1">
              {[
                ['VND-001', 'Patanjali Foods Ltd'],
                ['VND-002', 'Amul Dairy Corp'],
                ['VND-003', 'ITC Limited'],
                ['VND-004', 'Britannia Industries'],
                ['VND-005', 'HUL India'],
              ].map(([code, name]) => (
                <div key={code} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#00ff88]/60 w-16">{code}</span>
                  <span className="text-[10px] text-white/40">{name}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-white/30 mb-2">SKUs</p>
            <div className="space-y-1">
              {[
                ['SKU-RICE-001', 'India Gate Basmati 5kg'],
                ['SKU-OIL-012',  'Patanjali Mustard Oil 1L'],
                ['SKU-MILK-001', 'Amul Full Cream Milk 1L'],
                ['SKU-BIS-044',  'Britannia Good Day 200g'],
                ['SKU-SOD-008',  'Surf Excel 1kg'],
              ].map(([code, name]) => (
                <div key={code} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#3b82f6]/60 w-24">{code}</span>
                  <span className="text-[10px] text-white/40">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
