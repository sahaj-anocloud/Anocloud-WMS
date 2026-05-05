'use client';

/**
 * Paper ASN Entry — for Gate Staff / Inbound Supervisors to manually capture
 * ASN data from a physical paper document brought by the truck driver.
 *
 * Channel: 'Paper' → confidence score 40–69 (lower than Portal/Email)
 * This is critical for Indian warehouses where vendors frequently arrive
 * without pre-submitted digital ASNs.
 *
 * Accessible to: Inbound_Supervisor, Gate_Staff, Admin_User
 */

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  vendor_name?: string;
  status: string;
  lines: POLine[];
}

interface PaperLine {
  sku_id: string;
  sku_name: string;
  category: string;
  ordered_qty: number;
  is_perishable: boolean;
  quantity: number;
  batch_number: string;
  expiry_date: string;
  damage_noted: boolean;
  damage_note: string;
}

interface ASNResponse {
  asn_id: string;
  confidence_score: number;
  status: string;
  is_late: boolean;
}

// ─── Score indicator ──────────────────────────────────────────────────────────

function PaperScoreIndicator({ completeness }: { completeness: number }) {
  const score = Math.round(40 + completeness * 29); // Paper range: 40–69
  const color = score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
      <div className="text-center">
        <p className="text-2xl font-bold" style={{ color }}>{score}</p>
        <p className="text-[9px] text-white/30">est. score</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-amber-400">Paper ASN — Lower Priority</p>
        <p className="text-[10px] text-white/40 mt-0.5">
          Paper channel scores 40–69. Vendor should submit via portal next time for priority dock.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaperASNPage() {
  const { addNotification } = useNotifications();
  const router = useRouter();

  const [step, setStep] = useState<'form' | 'success'>('form');
  const [submittedASN, setSubmittedASN] = useState<ASNResponse | null>(null);

  // PO lookup
  const [poInput, setPoInput] = useState('');
  const [poData, setPoData] = useState<POData | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState('');

  // Truck / driver info from paper document
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [handlingUnits, setHandlingUnits] = useState('');
  const [arrivalTime, setArrivalTime] = useState(
    new Date().toISOString().slice(0, 16) // default to now
  );
  const [enteredBy, setEnteredBy] = useState('');
  const [paperDocRef, setPaperDocRef] = useState('');

  // Line items
  const [lines, setLines] = useState<PaperLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Load PO ────────────────────────────────────────────────────────────────

  const handleLoadPO = useCallback(async () => {
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
          damage_noted: false,
          damage_note: '',
        }))
      );
    } catch {
      setPoError('PO not found or not Open. Verify the PO number from the paper document.');
      setPoData(null);
      setLines([]);
    } finally {
      setPoLoading(false);
    }
  }, [poInput]);

  const updateLine = (i: number, field: keyof PaperLine, value: string | number | boolean) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  // ── Completeness calc ──────────────────────────────────────────────────────

  const calcCompleteness = () => {
    let filled = 0;
    const total = 5 + (lines.length * 2);
    if (vehicleNumber) filled++;
    if (driverName) filled++;
    if (invoiceRef) filled++;
    if (handlingUnits) filled++;
    if (paperDocRef) filled++;
    for (const l of lines) {
      if (l.batch_number) filled++;
      if (l.expiry_date) filled++;
    }
    return total > 0 ? filled / total : 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poData) { addNotification('Load a PO first', 'error'); return; }
    if (!vehicleNumber.trim()) { addNotification('Vehicle number is required for paper ASN', 'error'); return; }
    if (lines.length === 0) { addNotification('No line items to submit', 'error'); return; }

    setSubmitting(true);
    const dcId = auth.getDcId();
    try {
      const payload = {
        dc_id: dcId,
        vendor_id: poData.vendor_id,
        po_id: poData.po_id,
        channel: 'Paper' as const,
        data_completeness: calcCompleteness(),
        slot_start: arrivalTime || undefined,
        vehicle_number: vehicleNumber.trim(),
        driver_name: driverName.trim() || undefined,
        handling_unit_count: handlingUnits ? parseInt(handlingUnits) : undefined,
        invoice_reference: invoiceRef.trim() || undefined,
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
      addNotification('Paper ASN captured successfully', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      addNotification(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────

  if (step === 'success' && submittedASN) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-fade-in">
        <div className="card p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#00ff88]/10 flex items-center justify-center mx-auto border border-[#00ff88]/20">
            <span className="text-2xl text-[#00ff88]">✓</span>
          </div>
          <h1 className="text-xl font-bold text-white">Paper ASN Captured</h1>
          <p className="text-xs text-white/40">
            ASN ID: <span className="font-mono text-[#00ff88]">{submittedASN.asn_id}</span>
          </p>

          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-amber-400">Confidence Score</span>
              <span className="text-xl font-bold text-amber-400">{submittedASN.confidence_score}</span>
            </div>
            <p className="text-[10px] text-white/40">
              Paper channel scores 40–69. Advise vendor to submit via portal next time for priority dock assignment.
            </p>
          </div>

          {submittedASN.is_late && (
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-left">
              <p className="text-xs text-red-400">⚠ Late submission — truck arrived without prior ASN. Score penalised.</p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-left space-y-2">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Next Steps</p>
            <p className="text-xs text-white/50">1. Assign dock from Dock Queue</p>
            <p className="text-xs text-white/50">2. Begin unloading and QC scanning</p>
            <p className="text-xs text-white/50">3. Notify vendor to register on portal for future deliveries</p>
          </div>

          <div className="flex gap-3 justify-center pt-2">
            <button onClick={() => router.push('/dock-queue')} className="btn-primary text-xs px-4 py-2.5">
              Go to Dock Queue →
            </button>
            <button
              onClick={() => {
                setStep('form');
                setSubmittedASN(null);
                setPoData(null);
                setPoInput('');
                setLines([]);
                setVehicleNumber('');
                setDriverName('');
                setInvoiceRef('');
                setHandlingUnits('');
                setPaperDocRef('');
              }}
              className="text-xs px-4 py-2.5 rounded-lg border border-white/[0.08] text-white/50 hover:text-white/70 transition-colors"
            >
              Capture Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
            📄 Paper ASN
          </span>
          <span className="text-[10px] text-white/30">Channel: Paper · Score range 40–69</span>
        </div>
        <h1 className="text-xl font-bold text-white">Capture Paper ASN</h1>
        <p className="text-xs text-white/40 mt-0.5">
          Enter ASN data from the physical document brought by the truck driver.
          Used when vendor has not submitted a digital ASN in advance.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Section 1 — PO Lookup */}
        <div className="card p-5">
          <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-4">
            1 · Purchase Order Reference
          </h2>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">PO Number *</label>
              <input
                value={poInput}
                onChange={e => setPoInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleLoadPO())}
                placeholder="e.g. PO-88291 (from paper document)"
                className="input-field w-full"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleLoadPO}
                disabled={poLoading || !poInput.trim()}
                className="px-4 py-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88] text-xs font-bold hover:bg-[#00ff88]/20 transition-colors disabled:opacity-40"
              >
                {poLoading ? '…' : 'Load PO'}
              </button>
            </div>
          </div>
          {poError && <p className="mt-2 text-xs text-red-400">{poError}</p>}
          {poData && (
            <div className="mt-3 p-3 rounded-xl bg-[#00ff88]/5 border border-[#00ff88]/20 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#00ff88] flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#00ff88]">{poData.sap_po_number} — {lines.length} line{lines.length !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-white/30">Vendor: {poData.vendor_name ?? poData.vendor_id} · Status: {poData.status}</p>
              </div>
            </div>
          )}
        </div>

        {/* Section 2 — Truck & Driver Info */}
        <div className="card p-5">
          <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-4">
            2 · Truck & Driver Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                Vehicle Registration * <span className="text-amber-400 font-normal normal-case">(required)</span>
              </label>
              <input
                value={vehicleNumber}
                onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g. KA01AB1234"
                className="input-field w-full font-mono tracking-wider"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Driver Name</label>
              <input
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
                placeholder="Driver's full name"
                className="input-field w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Arrival Date & Time</label>
              <input
                type="datetime-local"
                value={arrivalTime}
                onChange={e => setArrivalTime(e.target.value)}
                className="input-field w-full"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Handling Units</label>
              <input
                type="number"
                min="1"
                value={handlingUnits}
                onChange={e => setHandlingUnits(e.target.value)}
                placeholder="No. of pallets / boxes"
                className="input-field w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Invoice / Challan Number</label>
              <input
                value={invoiceRef}
                onChange={e => setInvoiceRef(e.target.value)}
                placeholder="Vendor invoice or delivery challan no."
                className="input-field w-full font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Paper Doc Reference</label>
              <input
                value={paperDocRef}
                onChange={e => setPaperDocRef(e.target.value)}
                placeholder="Physical document ID / stamp"
                className="input-field w-full font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5 mt-4">
            <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Entered By (Staff Name)</label>
            <input
              value={enteredBy}
              onChange={e => setEnteredBy(e.target.value)}
              placeholder="Your name — for audit trail"
              className="input-field w-full"
            />
          </div>
        </div>

        {/* Section 3 — Line Items */}
        {poData && lines.length > 0 && (
          <div className="card p-5">
            <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
              3 · Line Items from Paper Document
            </h2>
            <p className="text-[10px] text-white/30 mb-4">
              Enter quantities as stated on the paper document. Add batch/expiry if visible on packaging.
            </p>
            <div className="space-y-4">
              {lines.map((line, i) => (
                <div key={`${line.sku_id}-${i}`} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  {/* SKU header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white/80 truncate">{line.sku_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="font-mono text-[9px] text-white/25">{line.sku_id}</span>
                        <span className="text-[9px] text-white/25">{line.category}</span>
                        {line.is_perishable && (
                          <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">Perishable</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-white/30 flex-shrink-0">PO: {line.ordered_qty}</span>
                  </div>

                  {/* Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/30 uppercase tracking-wider">Qty on Paper *</label>
                      <input
                        type="number"
                        min="0"
                        value={line.quantity}
                        onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 0)}
                        className="input-field w-full text-sm py-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/30 uppercase tracking-wider">
                        Batch No {line.is_perishable && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        value={line.batch_number}
                        onChange={e => updateLine(i, 'batch_number', e.target.value)}
                        placeholder="From packaging label"
                        className={`input-field w-full text-sm py-2 font-mono ${line.is_perishable && !line.batch_number ? 'border-amber-500/40' : ''}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/30 uppercase tracking-wider">
                        Expiry Date {line.is_perishable && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="date"
                        value={line.expiry_date}
                        onChange={e => updateLine(i, 'expiry_date', e.target.value)}
                        className={`input-field w-full text-sm py-2 ${line.is_perishable && !line.expiry_date ? 'border-amber-500/40' : ''}`}
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/30 uppercase tracking-wider">Damage Noted?</label>
                      <div className="flex items-center gap-2 h-10">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${line.damage_noted ? 'bg-red-500 border-red-500' : 'border-white/20'}`}
                            onClick={() => updateLine(i, 'damage_noted', !line.damage_noted)}
                          >
                            {line.damage_noted && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs text-white/50">Yes, damaged</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Damage note */}
                  {line.damage_noted && (
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/30 uppercase tracking-wider">Damage Description</label>
                      <input
                        value={line.damage_note}
                        onChange={e => updateLine(i, 'damage_note', e.target.value)}
                        placeholder="Describe visible damage (e.g. torn packaging, wet carton)"
                        className="input-field w-full text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No PO loaded */}
        {!poData && (
          <div className="card p-8 text-center">
            <p className="text-white/20 text-sm">Load a PO above to enter line items</p>
          </div>
        )}

        {/* Score preview + submit */}
        {poData && (
          <div className="space-y-4">
            <PaperScoreIndicator completeness={calcCompleteness()} />

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white/40 hover:text-white/60 border border-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !poData || !vehicleNumber.trim()}
                className="btn-primary text-xs px-6 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : '📄 Submit Paper ASN'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
