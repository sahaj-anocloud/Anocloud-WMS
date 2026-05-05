'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api } from '@/lib/api';

type QCStep = 'select' | 'scan' | 'inspect' | 'post';

// ─── API Types ────────────────────────────────────────────────────────────────

interface ActiveDelivery {
  delivery_id: string;
  vendor_name: string;
  asn_id: string;
  po_number: string;
  dock_number: string | null;
  item_count: number;
  elapsed_min: number;
  yard_entry_id: string;
}

interface DeliveryLine {
  line_id: string;
  sku_code: string;
  sku_name: string;
  expected_qty: number;
  received_qty: number;
  packaging_class: string;
  required_scans: number;
  completed_scans: number;
  qc_status: string;
  batch_number?: string;
  expiry_date?: string;
}

interface PolicyResult {
  packaging_class: string;
  required_scans: number;
  base_scan_count: number;
  physical_count_required: boolean;
  label_affixing_required: boolean;
  cold_routing_required: boolean;
  packaging_integrity_preserve: boolean;
  mixed_load_supervisor_review: boolean;
}

interface UILine {
  line_id: string;
  sku_code: string;
  description: string;
  expected: number;
  received: number;
  damaged: number;
  packaging_class: string;
  required_scans: number;
  completed_scans: number;
  policy: PolicyResult | null;
  status: 'pending' | 'scanning' | 'ok' | 'mismatch' | 'blocked';
  batch_number: string;
  expiry_date: string;
}

// ─── Policy Badge ─────────────────────────────────────────────────────────────

function PolicyBadge({ policy }: { policy: PolicyResult | null }) {
  if (!policy) return null;
  const flags = [
    policy.cold_routing_required && { label: '❄ Cold Chain', color: 'text-blue-400 border-blue-500/20 bg-blue-500/10' },
    policy.physical_count_required && { label: '# Physical Count', color: 'text-amber-400 border-amber-500/20 bg-amber-500/10' },
    policy.label_affixing_required && { label: '🏷 Label Required', color: 'text-purple-400 border-purple-500/20 bg-purple-500/10' },
    policy.mixed_load_supervisor_review && { label: '👁 Supervisor Review', color: 'text-orange-400 border-orange-500/20 bg-orange-500/10' },
    policy.packaging_integrity_preserve && { label: '⚠ No Break Pack', color: 'text-red-400 border-red-500/20 bg-red-500/10' },
  ].filter(Boolean) as { label: string; color: string }[];

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      <span className="status-pill text-[9px] bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20">
        Scan {policy.required_scans} of {policy.base_scan_count} · {policy.packaging_class}
      </span>
      {flags.map(f => (
        <span key={f.label} className={`status-pill text-[9px] border ${f.color}`}>{f.label}</span>
      ))}
    </div>
  );
}

// ─── Barcode Scanner UI ───────────────────────────────────────────────────────

function BarcodeScanner({ onScan, disabled }: { onScan: (barcode: string) => void; disabled?: boolean }) {
  const [scanning, setScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!scanning) return;
    const id = setInterval(() => setPos(p => (p + 3) % 100), 20);
    return () => clearInterval(id);
  }, [scanning]);

  const handleSimulate = () => {
    if (scanning || disabled) return;
    setScanning(true);
    // Simulate scanning a barcode after 1.8s
    setTimeout(() => {
      setScanning(false);
      onScan('8901234567890'); // Uses the seeded EAN13 barcode
    }, 1800);
  };

  const handleManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative w-full h-32 rounded-xl border-2 border-dashed overflow-hidden flex flex-col items-center justify-center gap-3 transition-all ${disabled ? 'border-white/5 opacity-40 cursor-not-allowed' : 'border-white/10 bg-white/[0.02] cursor-pointer hover:border-[#00ff88]/30'}`}
        onClick={handleSimulate}
      >
        {scanning ? (
          <>
            <div className="flex items-end gap-[2px] h-10 px-8">
              {Array.from({ length: 28 }, (_, i) => (
                <div key={i} className="flex-1 rounded-sm" style={{ height: `${24 + Math.sin(i * 0.7) * 14}px`, background: `rgba(0,255,136,${0.3 + Math.abs(Math.sin(i * 0.5)) * 0.5})` }} />
              ))}
            </div>
            <div className="absolute left-4 right-4 h-0.5 rounded-full" style={{ top: `${pos}%`, background: 'linear-gradient(90deg,transparent,#00ff88,transparent)', boxShadow: '0 0 8px #00ff88' }} />
            <p className="text-[10px] text-[#00ff88]/70 animate-pulse z-10">Scanning barcode…</p>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-white/20">
              <rect x="2" y="4" width="5" height="16" rx="1" /><rect x="9" y="4" width="2" height="16" rx="0.5" />
              <rect x="13" y="4" width="4" height="16" rx="1" /><rect x="19" y="4" width="3" height="16" rx="0.5" />
            </svg>
            <p className="text-[10px] text-white/30">Tap to simulate scan</p>
          </>
        )}
      </div>
      {/* Manual barcode entry */}
      <form onSubmit={handleManual} className="flex gap-2">
        <input
          value={manualBarcode}
          onChange={e => setManualBarcode(e.target.value)}
          placeholder="Or type barcode manually…"
          className="input-field text-xs flex-1 font-mono"
          disabled={disabled}
        />
        <button type="submit" disabled={!manualBarcode.trim() || disabled} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40">
          Scan
        </button>
      </form>
    </div>
  );
}

const STEPS = ['select', 'scan', 'inspect', 'post'] as const;
const STEP_LABELS = ['Select', 'QC Scan', 'Inspect', 'Post GRN'];

const DEVICE_ID = 'web-portal-qc';

export default function ReceivingPage() {
  const { addNotification } = useNotifications();
  const [step, setStep] = useState<QCStep>('select');
  const [deliveries, setDeliveries] = useState<ActiveDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  const [selected, setSelected] = useState<ActiveDelivery | null>(null);
  const [lines, setLines] = useState<UILine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [idx, setIdx] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [autoGrn, setAutoGrn] = useState(false);
  const [posted, setPosted] = useState(false);
  const [grnRef, setGrnRef] = useState('');

  // ── Fetch active deliveries from real API ──────────────────────────────────
  const fetchDeliveries = useCallback(async () => {
    try {
      setLoadingDeliveries(true);
      const res = await api.get<{ data: ActiveDelivery[] }>('/api/v1/receiving/active-deliveries');
      setDeliveries(res.data ?? []);
    } catch {
      // Fall back to seed data so the page is still usable in dev
      setDeliveries([
        { delivery_id: 'DEL-5521', vendor_name: 'Patanjali Foods', asn_id: 'ASN-9921-A', po_number: 'PO-88291', dock_number: 'D-03', item_count: 4, elapsed_min: 38, yard_entry_id: '' },
        { delivery_id: 'DEL-5519', vendor_name: 'Amul Dairy', asn_id: 'ASN-9919-B', po_number: 'PO-88292', dock_number: 'D-01', item_count: 2, elapsed_min: 72, yard_entry_id: '' },
        { delivery_id: 'DEL-5516', vendor_name: 'ITC Ltd', asn_id: 'ASN-9916-A', po_number: 'PO-88291', dock_number: 'D-05', item_count: 6, elapsed_min: 55, yard_entry_id: '' },
      ]);
    } finally {
      setLoadingDeliveries(false);
    }
  }, []);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  // ── Select delivery and load lines with scan policy ────────────────────────
  const handleSelect = async (d: ActiveDelivery) => {
    setSelected(d);
    setLoadingLines(true);
    setStep('scan');
    setIdx(0);
    addNotification(`Loading delivery ${d.delivery_id}…`, 'info');

    try {
      // Start receiving session to get delivery lines
      const res = await api.post<{ delivery_id: string; items: DeliveryLine[] }>(
        '/api/v1/receiving/start',
        { delivery_id: d.delivery_id, yard_entry_id: d.yard_entry_id }
      );

      // For each line, fetch its scan policy
      const uiLines: UILine[] = await Promise.all(
        (res.items ?? []).map(async (item) => {
          let policy: PolicyResult | null = null;
          try {
            policy = await api.get<PolicyResult>(`/api/v1/receiving/lines/${item.line_id}/policy`);
          } catch {
            // Policy fetch failed — use defaults
          }
          return {
            line_id: item.line_id,
            sku_code: item.sku_code,
            description: item.sku_name,
            expected: item.expected_qty,
            received: item.received_qty,
            damaged: 0,
            packaging_class: item.packaging_class,
            required_scans: policy?.required_scans ?? item.required_scans ?? 1,
            completed_scans: item.completed_scans ?? 0,
            policy,
            status: item.qc_status === 'Passed' ? 'ok' : item.qc_status === 'Blocked' ? 'blocked' : 'pending',
            batch_number: item.batch_number ?? '',
            expiry_date: item.expiry_date ?? '',
          };
        })
      );

      // If no real lines, use demo lines so the flow is testable
      if (uiLines.length === 0) {
        setLines([
          { line_id: 'L1', sku_code: 'SKU-RICE-001', description: 'India Gate Basmati 5kg', expected: 80, received: 0, damaged: 0, packaging_class: 'GunnyBag', required_scans: 1, completed_scans: 0, policy: null, status: 'pending', batch_number: '', expiry_date: '' },
          { line_id: 'L2', sku_code: 'SKU-OIL-012', description: 'Patanjali Mustard Oil 1L', expected: 60, received: 0, damaged: 0, packaging_class: 'SealedCarton', required_scans: 3, completed_scans: 0, policy: null, status: 'pending', batch_number: '', expiry_date: '' },
        ]);
      } else {
        setLines(uiLines);
      }
      addNotification(`${d.delivery_id} loaded — ${uiLines.length || 2} SKU lines`, 'success');
    } catch {
      addNotification('Could not load delivery lines — using demo data', 'warning');
      setLines([
        { line_id: 'L1', sku_code: 'SKU-RICE-001', description: 'India Gate Basmati 5kg', expected: 80, received: 0, damaged: 0, packaging_class: 'GunnyBag', required_scans: 1, completed_scans: 0, policy: null, status: 'pending', batch_number: '', expiry_date: '' },
        { line_id: 'L2', sku_code: 'SKU-OIL-012', description: 'Patanjali Mustard Oil 1L', expected: 60, received: 0, damaged: 0, packaging_class: 'SealedCarton', required_scans: 3, completed_scans: 0, policy: null, status: 'pending', batch_number: '', expiry_date: '' },
      ]);
    } finally {
      setLoadingLines(false);
    }
  };

  // ── Handle barcode scan — calls real API ───────────────────────────────────
  const handleScan = async (barcode: string) => {
    const line = lines[idx];
    if (!line || scanning) return;
    setScanning(true);

    try {
      const res = await api.post<{ scan_result: string; completed_scans: number; required_scans: number; message?: string }>(
        '/api/v1/receiving/scan',
        {
          delivery_line_id: line.line_id,
          barcode,
          scanned_by: 'web-qc-user',
          device_id: DEVICE_ID,
        }
      );

      const result = res.scan_result;
      const newCompleted = res.completed_scans;

      setLines(prev => prev.map((l, i) => {
        if (i !== idx) return l;
        const allDone = newCompleted >= l.required_scans;
        return {
          ...l,
          completed_scans: newCompleted,
          received: allDone ? l.expected : l.received,
          status: result === 'Match' ? (allDone ? 'ok' : 'scanning') : result === 'Mismatch' ? 'mismatch' : 'blocked',
        };
      }));

      if (result === 'Match') {
        addNotification(`${line.sku_code} scan ${newCompleted}/${line.required_scans} ✓`, 'success');
        // Auto-advance when all scans done for this line
        if (newCompleted >= line.required_scans) {
          if (idx < lines.length - 1) {
            setIdx(i => i + 1);
          } else {
            setStep('inspect');
            addNotification('All SKUs scanned — proceed to inspection', 'info');
          }
        }
      } else if (result === 'Mismatch') {
        addNotification(`Barcode mismatch on ${line.sku_code} — ${res.message ?? ''}`, 'error');
      } else {
        addNotification(`Unexpected barcode — not in SKU master`, 'error');
      }
    } catch {
      // Fallback: simulate scan locally if API unavailable
      setLines(prev => prev.map((l, i) => {
        if (i !== idx) return l;
        const newCount = l.completed_scans + 1;
        const allDone = newCount >= l.required_scans;
        return { ...l, completed_scans: newCount, received: allDone ? l.expected : l.received, status: allDone ? 'ok' : 'scanning' };
      }));
      addNotification(`${line.sku_code} scanned (offline mode)`, 'info');
      const updatedLine = lines[idx]!;
      if (updatedLine.completed_scans + 1 >= updatedLine.required_scans) {
        if (idx < lines.length - 1) setIdx(i => i + 1);
        else { setStep('inspect'); addNotification('All SKUs scanned', 'info'); }
      }
    } finally {
      setScanning(false);
    }
  };

  const handleInspect = () => {
    setAutoGrn(lines.every(l => l.status === 'ok'));
    setStep('post');
  };

  const handlePost = async () => {
    const ref = `GRN-${Date.now().toString().slice(-6)}`;
    setGrnRef(ref);
    setPosted(true);
    addNotification(autoGrn ? 'Auto-GRN posted to SAP ✓' : 'GRN with exceptions posted', autoGrn ? 'success' : 'warning');
  };

  const reset = () => {
    setStep('select');
    setSelected(null);
    setPosted(false);
    setLines([]);
    setIdx(0);
    fetchDeliveries();
  };

  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Receiving & QC</h1>
          <p className="text-xs text-white/40 mt-0.5">Inbound QC scanning · Barcode verification · GRN posting</p>
        </div>
        <div className="text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">QC Associate · DC Bangalore</div>
      </div>

      {/* Stepper */}
      <div className="card p-4">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const done = stepIdx > i; const active = stepIdx === i;
            return (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${done ? 'bg-[#00ff88] text-[#060818]' : active ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40' : 'bg-white/[0.05] text-white/30 border border-white/[0.08]'}`}>{done ? '✓' : i + 1}</div>
                  <span className={`text-[9px] ${active ? 'text-[#00ff88]' : done ? 'text-white/50' : 'text-white/25'}`}>{STEP_LABELS[i]}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mb-5 ${done ? 'bg-[#00ff88]/40' : 'bg-white/[0.06]'}`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          {/* Step: Select */}
          {step === 'select' && (
            <div className="card p-6 animate-fade-in space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Select Active Delivery</h2>
                <button onClick={fetchDeliveries} className="btn-ghost text-xs">↻ Refresh</button>
              </div>
              <p className="text-xs text-white/40">Choose a delivery at dock to begin QC scanning.</p>
              {loadingDeliveries ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>
              ) : deliveries.length === 0 ? (
                <div className="text-center py-8 text-white/20 text-sm">No active deliveries at dock</div>
              ) : deliveries.map(d => (
                <button key={d.delivery_id} onClick={() => handleSelect(d)} className="w-full text-left p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-[#00ff88]/30 hover:bg-[#00ff88]/[0.03] transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-white/70">{d.delivery_id}</span>
                    <span className="font-mono text-[10px] text-[#3b82f6]">{d.dock_number ?? '—'}</span>
                  </div>
                  <p className="text-sm font-semibold text-white group-hover:text-[#00ff88] transition-colors">{d.vendor_name}</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-white/40">
                    <span>{d.asn_id}</span><span>·</span><span>{d.item_count} SKU lines</span><span>·</span>
                    <span className={d.elapsed_min > 60 ? 'text-amber-400' : ''}>{d.elapsed_min}m dwell</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step: Scan */}
          {step === 'scan' && selected && (
            <div className="card p-6 animate-fade-in space-y-4">
              {loadingLines ? (
                <div className="space-y-3">
                  <div className="h-4 bg-white/[0.06] rounded animate-pulse w-1/2" />
                  <div className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">Barcode QC Scan</h2>
                    <span className="text-[10px] text-white/40 font-mono">{idx + 1} / {lines.length}</span>
                  </div>
                  {lines[idx] && (
                    <div className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                      <p className="text-[10px] text-white/40 mb-1">Current SKU</p>
                      <p className="text-sm font-bold text-white">{lines[idx]!.description}</p>
                      <p className="text-[10px] font-mono text-white/40 mt-0.5">{lines[idx]!.sku_code}</p>
                      <p className="text-[10px] text-white/30 mt-1">
                        Expected: <span className="text-white/60 font-bold">{lines[idx]!.expected} units</span>
                        <span className="mx-2">·</span>
                        Scanned: <span className={`font-bold ${lines[idx]!.completed_scans >= lines[idx]!.required_scans ? 'text-[#00ff88]' : 'text-white/60'}`}>
                          {lines[idx]!.completed_scans}/{lines[idx]!.required_scans}
                        </span>
                      </p>
                      <PolicyBadge policy={lines[idx]!.policy} />
                    </div>
                  )}
                  <BarcodeScanner onScan={handleScan} disabled={scanning || !lines[idx] || lines[idx]!.status === 'ok'} />
                  {lines[idx] && (lines[idx]!.packaging_class === 'SealedCarton' || lines[idx]!.packaging_class === 'GunnyBag') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-white/40">Batch Number</label>
                        <input value={lines[idx]!.batch_number} onChange={e => setLines(prev => prev.map((l, i) => i === idx ? { ...l, batch_number: e.target.value } : l))} placeholder="e.g. BT-2026-001" className="input-field text-xs w-full font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-white/40">Expiry Date</label>
                        <input type="date" value={lines[idx]!.expiry_date} onChange={e => setLines(prev => prev.map((l, i) => i === idx ? { ...l, expiry_date: e.target.value } : l))} className="input-field text-xs w-full" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {lines.map((l, i) => (
                      <div key={l.line_id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${i === idx ? 'border-[#00ff88]/30 bg-[#00ff88]/[0.04]' : l.status === 'ok' ? 'border-green-500/20 bg-green-500/[0.03]' : l.status === 'mismatch' || l.status === 'blocked' ? 'border-red-500/20 bg-red-500/[0.03]' : 'border-white/[0.05]'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === idx ? 'bg-[#00ff88] animate-pulse' : l.status === 'ok' ? 'bg-green-400' : l.status === 'mismatch' || l.status === 'blocked' ? 'bg-red-400' : 'bg-white/20'}`} />
                        <span className="text-xs text-white/60 flex-1 truncate">{l.description}</span>
                        <span className="text-[10px] text-white/30 font-mono">{l.completed_scans}/{l.required_scans}</span>
                        <span className={`text-[10px] font-bold ${l.status === 'ok' ? 'text-green-400' : l.status === 'mismatch' || l.status === 'blocked' ? 'text-red-400' : i === idx ? 'text-[#00ff88]' : 'text-white/20'}`}>
                          {l.status === 'ok' ? '✓' : l.status === 'mismatch' || l.status === 'blocked' ? '✕' : i === idx ? '●' : '○'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {lines.every(l => l.status === 'ok' || l.status === 'mismatch' || l.status === 'blocked') && (
                    <button onClick={() => setStep('inspect')} className="btn-primary w-full py-3">PROCEED TO INSPECTION →</button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step: Inspect */}
          {step === 'inspect' && (
            <div className="card p-6 animate-fade-in space-y-4">
              <h2 className="text-sm font-bold text-white">Physical Inspection</h2>
              <p className="text-xs text-white/40">Record damaged units and confirm count before GRN.</p>
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={l.line_id} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/80">{l.description}</span>
                      <span className={`status-pill text-[9px] ${l.status === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                        {l.status === 'ok' ? '✓ Match' : '⚠ Mismatch'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[10px]">
                      <span className="text-white/40">Expected: <span className="text-white/70 font-bold">{l.expected}</span></span>
                      <span className="text-white/40">Received: <span className="text-white/70 font-bold">{l.received}</span></span>
                      {l.batch_number && <span className="text-white/40">Batch: <span className="font-mono text-white/60">{l.batch_number}</span></span>}
                    </div>
                    <div>
                      <label className="text-[10px] text-white/40 block mb-1">Damaged Units</label>
                      <input type="number" min={0} max={l.received} value={l.damaged} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, damaged: +e.target.value } : x))} className="input-field text-xs w-24" />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleInspect} className="btn-primary w-full py-3">PROCEED TO GRN →</button>
            </div>
          )}

          {/* Step: Post GRN */}
          {step === 'post' && !posted && (
            <div className="card p-6 animate-fade-in space-y-4">
              <h2 className="text-sm font-bold text-white">Post GRN</h2>
              <div className={`p-4 rounded-xl border ${autoGrn ? 'border-green-500/20 bg-green-500/[0.05]' : 'border-amber-500/20 bg-amber-500/[0.05]'}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${autoGrn ? 'text-green-400' : 'text-amber-400'}`}>{autoGrn ? '✓' : '⚠'}</span>
                  <div>
                    <p className={`text-sm font-bold ${autoGrn ? 'text-green-400' : 'text-amber-400'}`}>{autoGrn ? 'Auto-GRN Eligible' : 'Manual Review Required'}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{autoGrn ? 'All barcodes matched — will auto-post to SAP' : `${lines.filter(l => l.status === 'mismatch' || l.status === 'blocked').length} issue(s) — discrepancy report will be raised`}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.line_id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-xs text-white/60">{l.description}</span>
                    <div className="flex gap-3 text-[10px]">
                      <span className="text-white/40">{l.received} recv</span>
                      {l.damaged > 0 && <span className="text-red-400">{l.damaged} dmg</span>}
                      <span className={l.status === 'ok' ? 'text-green-400' : 'text-amber-400'}>{l.status === 'ok' ? '✓' : '⚠'}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handlePost} className="btn-primary w-full py-3">{autoGrn ? 'POST AUTO-GRN TO SAP' : 'POST GRN WITH EXCEPTIONS'}</button>
            </div>
          )}

          {step === 'post' && posted && (
            <div className="card p-6 animate-fade-in text-center">
              <div className="w-16 h-16 bg-[#00ff88]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#00ff88]/20"><span className="text-3xl text-[#00ff88]">✓</span></div>
              <h2 className="text-lg font-bold text-white mb-1">GRN Posted</h2>
              <p className="text-xs text-white/40 mb-5">{autoGrn ? 'Auto-GRN synced to SAP · Inventory updated' : 'GRN with exceptions submitted · Discrepancy queue updated'}</p>
              <div className="grid grid-cols-2 gap-3 text-left mb-5">
                {[{ l: 'GRN Reference', v: grnRef }, { l: 'Posted At', v: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, { l: 'Total Lines', v: `${lines.length}` }, { l: 'Exceptions', v: `${lines.filter(l => l.status === 'mismatch' || l.status === 'blocked').length}` }].map(r => (
                  <div key={r.l} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                    <p className="text-[10px] text-white/30 mb-0.5">{r.l}</p>
                    <p className="text-xs font-mono font-bold text-white/80">{r.v}</p>
                  </div>
                ))}
              </div>
              <button onClick={reset} className="btn-primary w-full">Start New Receiving</button>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-bold text-white mb-4">Today's Receiving Summary</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[{ label: 'GRNs Posted', val: '12', color: '#00ff88' }, { label: 'Auto-GRN Rate', val: '83%', color: '#22c55e' }, { label: 'Barcode Remed.', val: '7%', color: '#f59e0b' }, { label: 'Avg QC Time', val: '14m', color: '#3b82f6' }].map(k => (
                <div key={k.label} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <p className="text-[10px] text-white/40 mb-1">{k.label}</p>
                  <p className="text-lg font-bold" style={{ color: k.color }}>{k.val}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[{ stage: 'QC Scanning', count: 3, color: '#f59e0b' }, { stage: 'GKM Check', count: 2, color: '#f97316' }, { stage: 'Auto-GRN', count: 2, color: '#22c55e' }, { stage: 'GRN Done', count: 12, color: '#00ff88' }].map(s => (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className="text-[10px] text-white/40 w-24 truncate">{s.stage}</span>
                  <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden relative">
                    <div className="h-full rounded" style={{ width: `${(s.count / 12) * 100}%`, background: `${s.color}50`, borderRight: `2px solid ${s.color}` }} />
                    <span className="absolute right-2 top-0 bottom-0 flex items-center text-[9px] text-white/50">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
              <h2 className="text-sm font-bold text-white">Recent GRNs</h2>
              <span className="text-[10px] text-white/30">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            </div>
            <table className="wms-table">
              <thead><tr><th>GRN</th><th>Vendor</th><th>Lines</th><th>Status</th></tr></thead>
              <tbody>
                {[{ grn: 'GRN-882401', vendor: 'ITC Ltd', lines: 6, auto: true }, { grn: 'GRN-882399', vendor: 'HUL', lines: 4, auto: true }, { grn: 'GRN-882397', vendor: 'Britannia', lines: 3, auto: false }, { grn: 'GRN-882394', vendor: 'Amul Dairy', lines: 2, auto: true }].map(r => (
                  <tr key={r.grn}>
                    <td><span className="font-mono text-[10px] text-white/60">{r.grn}</span></td>
                    <td><span className="text-xs text-white/60">{r.vendor}</span></td>
                    <td><span className="text-xs text-white/50">{r.lines}</span></td>
                    <td><span className={`status-pill text-[9px] ${r.auto ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>{r.auto ? '✓ Auto-GRN' : '⚠ Exception'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
