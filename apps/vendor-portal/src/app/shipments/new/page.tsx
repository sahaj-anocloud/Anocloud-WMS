'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface POLine {
  sku_id: string;
  sku_name: string;
  category: string;
  ordered_qty: number;
  is_perishable: boolean;
}

interface POData {
  po_id: string;
  sap_po_number: string;
  vendor_id: string;
  status: string;
  lines: POLine[];
}

interface LineItem {
  sku_id: string;
  sku_name: string;
  category: string;
  ordered_qty: number;
  is_perishable: boolean;
  quantity: number;
  batch_number: string;
  expiry_date: string;
}

interface ASNResponse {
  asn_id: string;
  confidence_score: number;
  status: string;
  is_late: boolean;
}

/* ─── Confidence Score Badge ──────────────────────────────────────────────── */
function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 90 ? '#00ff88' : score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 40 ? 'Fair' : 'Low';
  const circ = 2 * Math.PI * 40;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={100} height={100} viewBox="0 0 100 100">
          <circle cx={50} cy={50} r={40} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle cx={50} cy={50} r={40} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
            transform="rotate(-90 50 50)"
            style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dasharray 1s ease' }} />
          <text x={50} y={46} textAnchor="middle" fill={color} fontSize="20" fontWeight="700">{score}</text>
          <text x={50} y={62} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">/100</text>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold" style={{ color }}>{label} Confidence</p>
        <p className="text-xs text-white/40 mt-1">
          {score >= 90 ? 'Your shipment will receive priority dock assignment.' :
           score >= 70 ? 'Good ASN quality. Add batch/expiry to improve.' :
           score >= 40 ? 'Add vehicle, driver and batch details to improve.' :
           'Please complete all fields for better dock priority.'}
        </p>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function NewASNPage() {
  const { addNotification } = useNotifications();
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [submittedASN, setSubmittedASN] = useState<ASNResponse | null>(null);

  // PO loading
  const [poInput, setPoInput] = useState('');
  const [poData, setPoData] = useState<POData | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState('');

  // Form fields
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [handlingUnits, setHandlingUnits] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  /* Load PO and pre-populate lines */
  const handleLoadPO = async () => {
    if (!poInput.trim()) return;
    setPoLoading(true);
    setPoError('');
    try {
      const data = await api.get<POData>(`/api/v1/purchase-orders/${poInput.trim()}`);
      setPoData(data);
      setLines(
        (data.lines ?? []).map(l => ({
          sku_id: l.sku_id,
          sku_name: l.sku_name,
          category: l.category,
          ordered_qty: l.ordered_qty,
          is_perishable: l.is_perishable,
          quantity: l.ordered_qty,
          batch_number: '',
          expiry_date: '',
        }))
      );
    } catch {
      setPoError('PO not found or not Open. Check the PO number and try again.');
      setPoData(null);
      setLines([]);
    } finally {
      setPoLoading(false);
    }
  };

  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  /* Calculate data_completeness (0.0–1.0) based on filled fields */
  const calcCompleteness = () => {
    let filled = 0;
    const total = 4 + (lines.length * 2);
    if (vehicleNumber) filled++;
    if (driverName) filled++;
    if (handlingUnits) filled++;
    if (invoiceRef) filled++;
    for (const l of lines) {
      if (l.batch_number) filled++;
      if (l.expiry_date) filled++;
    }
    return total > 0 ? filled / total : 0;
  };

  /* Submit */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poData) { addNotification('Please load a PO first', 'error'); return; }
    if (lines.length === 0) { addNotification('No line items to submit', 'error'); return; }

    // Perishable validation (Req 8.6)
    const missingPerishables = lines.filter(l => l.is_perishable && (!l.batch_number || !l.expiry_date));
    if (missingPerishables.length > 0) {
      addNotification('Batch and Expiry are required for all perishable items', 'error');
      return;
    }

    setSubmitting(true);
    const dcId = auth.getDcId();
    try {
      const payload = {
        dc_id: dcId,
        vendor_id: poData.vendor_id,
        po_id: poData.po_id,
        channel: 'Portal' as const,
        data_completeness: calcCompleteness(),
        slot_start: slotStart || undefined,
        vehicle_number: vehicleNumber || undefined,
        driver_name: driverName || undefined,
        handling_unit_count: handlingUnits ? parseInt(handlingUnits) : undefined,
        invoice_reference: invoiceRef || undefined,
        lines: lines.map(l => ({
          sku_id: l.sku_id,
          quantity: l.quantity,
          batch_number: l.batch_number || undefined,
          expiry_date: l.expiry_date || undefined,
        })),
      };

      const result = await api.post<ASNResponse>('/api/v1/asns', payload);
      setSubmittedASN(result);
      setStep('success');
      addNotification('ASN submitted successfully!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      addNotification(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Success Screen ──────────────────────────────────────────────────── */
  if (step === 'success' && submittedASN) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">ASN Submitted</h1>
          <p className="text-white/40 text-sm mb-2">Reference: <span className="font-mono text-[#00ff88]">{submittedASN.asn_id}</span></p>
          {submittedASN.is_late && (
            <p className="text-amber-400 text-xs bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-6">
              ⚠ ASN submitted less than 2 hours before slot — late penalty applied to score.
            </p>
          )}
          <div className="my-8">
            <ConfidenceBadge score={submittedASN.confidence_score} />
          </div>
          <div className="bg-white/[0.03] rounded-xl p-4 text-left mb-8 space-y-2">
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-3">How to improve your score next time</p>
            <p className="text-xs text-white/50">✓ Submit via Portal (already done — +40 pts)</p>
            <p className="text-xs text-white/50">• Add vehicle number and driver name (+15 pts)</p>
            <p className="text-xs text-white/50">• Add batch number on every line (+15 pts)</p>
            <p className="text-xs text-white/50">• Add expiry date on every line (+15 pts)</p>
            <p className="text-xs text-white/50">• Submit more than 4 hours before slot (+10 pts)</p>
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => router.push('/appointments')} className="btn-primary text-sm px-5 py-2.5 rounded-lg">
              Book Delivery Slot →
            </button>
            <button onClick={() => { setStep('form'); setSubmittedASN(null); setPoData(null); setPoInput(''); setLines([]); }}
              className="text-sm px-5 py-2.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors">
              Submit Another ASN
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Form ────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Vendor Portal</p>
        <h1 className="text-2xl font-bold text-white">Create New ASN</h1>
        <p className="text-white/40 text-sm mt-1">Advance Shipment Notice · Channel: Portal (highest confidence score)</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Step 1 — PO Reference */}
        <div className="card p-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#00ff88]/20 text-[#00ff88] text-[10px] flex items-center justify-center font-bold">1</span>
            Purchase Order
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">PO Number</label>
              <input
                type="text"
                value={poInput}
                onChange={e => setPoInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleLoadPO())}
                placeholder="e.g. PO-88291"
                className="input-field"
              />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={handleLoadPO} disabled={poLoading || !poInput.trim()}
                className="px-5 py-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88] text-sm font-bold hover:bg-[#00ff88]/20 transition-colors disabled:opacity-40">
                {poLoading ? '...' : 'Load PO'}
              </button>
            </div>
          </div>
          {poError && <p className="mt-2 text-xs text-red-400">{poError}</p>}
          {poData && (
            <div className="mt-4 p-3 rounded-xl bg-[#00ff88]/5 border border-[#00ff88]/20 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#00ff88]" />
              <div>
                <p className="text-xs font-bold text-[#00ff88]">{poData.sap_po_number} — {lines.length} line{lines.length !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-white/30">Status: {poData.status} · Vendor: {poData.vendor_id}</p>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 — Shipment Details */}
        <div className="card p-6">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#00ff88]/20 text-[#00ff88] text-[10px] flex items-center justify-center font-bold">2</span>
            Shipment Details
            <span className="text-[10px] text-white/30 font-normal ml-1">— each field improves your confidence score</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Vehicle Number <span className="text-[#f59e0b]">+10 pts</span></label>
              <input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)}
                placeholder="e.g. KA01AB1234" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Driver Name <span className="text-[#f59e0b]">+5 pts</span></label>
              <input type="text" value={driverName} onChange={e => setDriverName(e.target.value)}
                placeholder="Driver's full name" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Expected Arrival Date & Time</label>
              <input type="datetime-local" value={slotStart} onChange={e => setSlotStart(e.target.value)}
                className="input-field" style={{ colorScheme: 'dark' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Handling Units (Pallets/Boxes) <span className="text-[#f59e0b]">+10 pts</span></label>
              <input type="number" min="1" value={handlingUnits} onChange={e => setHandlingUnits(e.target.value)}
                placeholder="e.g. 12" className="input-field" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Invoice Reference <span className="text-[#f59e0b]">+5 pts</span></label>
              <input type="text" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)}
                placeholder="Vendor invoice number" className="input-field" />
            </div>
          </div>
        </div>

        {/* Step 3 — Line Items */}
        {poData && lines.length > 0 && (
          <div className="card p-6">
            <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#00ff88]/20 text-[#00ff88] text-[10px] flex items-center justify-center font-bold">3</span>
              Line Items
            </h2>
            <p className="text-[11px] text-white/30 mb-5 ml-7">
              Adding batch &amp; expiry for every line gives <span className="text-[#00ff88]">+30 pts</span> total.
              Mandatory for Perishable &amp; FMCG Food categories.
            </p>
            <div className="space-y-4">
              {lines.map((line, i) => (
                <div key={line.sku_id} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{line.sku_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-white/30">{line.sku_id}</span>
                        <span className="text-[10px] text-white/30">·</span>
                        <span className="text-[10px] text-white/30">{line.category}</span>
                        {line.is_perishable && (
                          <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">Perishable</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-white/30 flex-shrink-0">PO Qty: {line.ordered_qty}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-1">Qty *</label>
                      <input type="number" min="0" value={line.quantity}
                        onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 0)}
                        className="input-field text-sm py-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-1">
                        Batch No {line.is_perishable ? <span className="text-red-400 font-bold">*</span> : ''}
                      </label>
                      <input type="text" value={line.batch_number}
                        onChange={e => updateLine(i, 'batch_number', e.target.value)}
                        placeholder="e.g. B2024-001" 
                        className={`input-field text-sm py-2 ${line.is_perishable && !line.batch_number ? 'border-red-500/50' : ''}`} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-1">
                        Expiry Date {line.is_perishable ? <span className="text-red-400 font-bold">*</span> : ''}
                      </label>
                      <input type="date" value={line.expiry_date}
                        onChange={e => updateLine(i, 'expiry_date', e.target.value)}
                        className={`input-field text-sm py-2 w-full ${line.is_perishable && !line.expiry_date ? 'border-red-500/50' : ''}`} 
                        style={{ colorScheme: 'dark' }} />
                      {line.is_perishable && (!line.batch_number || !line.expiry_date) && (
                        <p className="text-[9px] text-red-400 mt-1">Batch & Expiry mandatory for perishable items</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No PO loaded state */}
        {!poData && (
          <div className="card p-10 text-center">
            <p className="text-white/30 text-sm">Load a PO above to see line items</p>
            <p className="text-white/20 text-xs mt-1">Line items will auto-populate from the SAP purchase order</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="p-4 bg-[#00ff88]/5 border border-[#00ff88]/10 rounded-xl flex gap-3 items-start flex-1">
            <div className="w-5 h-5 rounded-full bg-[#00ff88]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[#00ff88] text-[10px] font-bold">i</span>
            </div>
            <p className="text-xs text-[#00ff88]/70">
              Higher confidence scores get priority dock assignment and shorter wait times.
              Portal submissions start at 40 points — complete all fields to reach 100.
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button type="button" onClick={() => router.back()}
              className="px-5 py-3 rounded-xl text-sm font-bold text-white/40 hover:bg-white/5 transition-colors border border-white/[0.06]">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !poData}
              className="btn-primary text-sm px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Submitting...' : 'Submit ASN →'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
