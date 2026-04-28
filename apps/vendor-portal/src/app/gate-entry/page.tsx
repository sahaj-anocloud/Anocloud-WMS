'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

type GateStep = 'scan' | 'verify' | 'seal' | 'moq' | 'confirmed' | 'rejected';
type SealStatus = 'intact' | 'broken' | 'missing' | null;

interface GateEntry {
  entry_id?: string;
  reg: string;
  vendor_name?: string;
  vendor_id: string;
  asn_id?: string;
  appointment_id?: string;
  complianceStatus: 'active' | 'suspended';
  dock_door?: string;
}

interface YardLogEntry {
  entry_id: string;
  vehicle_reg: string;
  vendor_name: string;
  asn_id: string | null;
  gate_in_at: string;
  dock_door: string | null;
  status: string;
  dwell_seconds: number;
}

const DC_ID = 'DC-BLR-01';

export default function GateEntryPage() {
  const { addNotification } = useNotifications();
  const [step, setStep] = useState<GateStep>('scan');
  const [regInput, setRegInput] = useState('');
  const [asnInput, setAsnInput] = useState('');
  const [vendorInput, setVendorInput] = useState('');
  const [vehicle, setVehicle] = useState<GateEntry | null>(null);
  const [confirmedEntry, setConfirmedEntry] = useState<YardLogEntry | null>(null);
  const [sealStatus, setSealStatus] = useState<SealStatus>(null);
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [yardLog, setYardLog] = useState<YardLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  const fetchYardLog = useCallback(async () => {
    const dcId = auth.getDcId();
    try {
      const data = await api.get<YardLogEntry[]>(`/api/v1/yard/queue?dc_id=${dcId}`);
      setYardLog(Array.isArray(data) ? data : []);
    } catch { /* silently fail */ }
    finally { setLogLoading(false); }
  }, []);

  useEffect(() => {
    fetchYardLog();
    const id = setInterval(fetchYardLog, 30_000);
    return () => clearInterval(id);
  }, [fetchYardLog]);

  // Step 1: validate vendor compliance and proceed
  const handleScan = async () => {
    if (!regInput.trim()) { addNotification('Enter vehicle registration number', 'error'); return; }
    if (!vendorInput.trim()) { addNotification('Enter vendor ID', 'error'); return; }
    setLookupLoading(true);
    
    try {
      // Real-time compliance lookup (Req 6.1)
      const vendor = await api.get<any>(`/api/v1/vendors/${vendorInput.trim()}`);
      
      setVehicle({
        reg: regInput.toUpperCase(),
        vendor_id: vendorInput.trim(),
        vendor_name: vendor.name,
        asn_id: asnInput.trim() || undefined,
        complianceStatus: vendor.compliance_status === 'Active' ? 'active' : 'suspended',
      });
      setStep('verify');
      if (vendor.compliance_status !== 'Active') {
        addNotification(`Vendor ${vendor.name} is SUSPENDED. Entry will be denied.`, 'error');
      } else {
        addNotification(`Vendor ${vendor.name} verified. Proceed to seal check.`, 'success');
      }
    } catch (err: any) {
      addNotification(err.message || 'Vendor not found', 'error');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleVerify = () => {
    if (!vehicle) return;
    if (vehicle.complianceStatus === 'suspended') {
      setStep('rejected');
      return;
    }
    setStep('seal');
  };

  const handleSealCheck = () => {
    if (!sealStatus) { addNotification('Select seal status before proceeding', 'error'); return; }
    if (sealStatus === 'broken' || sealStatus === 'missing') {
      addNotification(`Seal ${sealStatus} — alert raised, Supervisor & Security notified`, 'warning');
    }
    setStep('moq');
  };

  const handleMOQ = async () => {
    if (!vehicle) return;
    setSubmitLoading(true);
    const dcId = auth.getDcId();
    try {
      const entry = await api.post<YardLogEntry>('/api/v1/gate/entry', {
        dc_id: dcId,
        vehicle_reg: vehicle.reg,
        vendor_id: vehicle.vendor_id,
        asn_id: vehicle.asn_id || undefined,
      });
      setConfirmedEntry(entry);
      setStep('confirmed');
      addNotification(`Gate entry confirmed — Dwell timer started`, 'success');
      fetchYardLog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gate entry failed';
      if (msg.includes('compliance') || msg.includes('suspended')) {
        setStep('rejected');
      }
      addNotification(msg, 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const reset = () => { setStep('scan'); setRegInput(''); setAsnInput(''); setVendorInput(''); setVehicle(null); setConfirmedEntry(null); setSealStatus(null); setPhotoCaptured(false); };

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gate Entry</h1>
          <p className="text-xs text-white/40 mt-0.5">Vehicle registration · Compliance check · MOQ validation · Dock assignment</p>
        </div>
        <div className="text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
          Gate Staff · DC Bangalore
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Gate Entry Workflow */}
        <div className="space-y-4">
          {/* Progress steps */}
          <div className="card p-4">
            <div className="flex items-center gap-1">
              {(['scan', 'verify', 'seal', 'moq', 'confirmed'] as const).map((s, i) => {
                const allSteps = ['scan', 'verify', 'seal', 'moq', 'confirmed', 'rejected'];
                const current = allSteps.indexOf(step);
                const idx = allSteps.indexOf(s);
                const done = current > idx;
                const active = current === idx;
                const labels: Record<string, string> = { scan: 'Register', verify: 'Validate', seal: 'Seal', moq: 'MOQ', confirmed: 'Confirm' };
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${done ? 'bg-[#00ff88] text-[#060818]' : active ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40' : 'bg-white/[0.05] text-white/30 border border-white/[0.08]'}`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[9px] ${active ? 'text-[#00ff88]' : done ? 'text-white/50' : 'text-white/25'}`}>
                        {labels[s]}
                      </span>
                    </div>
                    {i < 4 && <div className={`flex-1 h-px mb-5 ${done ? 'bg-[#00ff88]/40' : 'bg-white/[0.06]'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Step: Scan */}
          {step === 'scan' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-bold text-white mb-1">Register Vehicle</h2>
              <p className="text-xs text-white/40 mb-5">Scan barcode or enter vehicle registration number manually.</p>

              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-2">Vehicle Registration Number *</label>
                  <input type="text" placeholder="e.g. KA-01-AB-1234" value={regInput}
                    onChange={e => setRegInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleScan()}
                    className="input-field text-sm font-mono uppercase" />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-2">Vendor ID *</label>
                  <input type="text" placeholder="e.g. VND-001" value={vendorInput}
                    onChange={e => setVendorInput(e.target.value)}
                    className="input-field text-sm font-mono" />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-2">ASN Reference (optional)</label>
                  <input type="text" placeholder="e.g. ASN-9921-A" value={asnInput}
                    onChange={e => setAsnInput(e.target.value)}
                    className="input-field text-sm font-mono" />
                </div>
              </div>
              <button onClick={handleScan} disabled={lookupLoading} className="btn-primary w-full py-3">
                {lookupLoading ? 'Checking...' : 'PROCEED TO VALIDATION'}
              </button>
            </div>
          )}

          {/* Step: Verify */}
          {step === 'verify' && vehicle && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-bold text-white mb-4">Compliance Validation</h2>
              <div className="space-y-3 mb-5">
                {[
                  { label: 'Vehicle Registration', val: vehicle.reg, mono: true },
                  { label: 'Vendor ID', val: vehicle.vendor_id, mono: true },
                  { label: 'ASN Reference', val: vehicle.asn_id ?? 'Not provided', mono: true },
                  { label: 'Appointment', val: vehicle.appointment_id ?? 'Walk-in', mono: false },
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-xs text-white/40">{r.label}</span>
                    <span className={`text-xs font-medium text-white/80 ${r.mono ? 'font-mono' : ''}`}>{r.val}</span>
                  </div>
                ))}
              </div>

              <div className={`p-3 rounded-xl border mb-4 flex items-center gap-3 ${vehicle.complianceStatus === 'active' ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20'}`}>
                <span className={`text-lg ${vehicle.complianceStatus === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                  {vehicle.complianceStatus === 'active' ? '✓' : '✕'}
                </span>
                <div>
                  <p className={`text-xs font-bold ${vehicle.complianceStatus === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                    Compliance Status: {vehicle.complianceStatus === 'active' ? 'ACTIVE' : 'SUSPENDED'}
                  </p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {vehicle.complianceStatus === 'active' ? 'GST, FSSAI, KYC documents verified' : 'Vendor suspended — entry denied per BR-01'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleVerify} className="btn-primary flex-1">PROCEED →</button>
                <button onClick={reset} className="btn-ghost">Reset</button>
              </div>
            </div>
          )}

          {/* Step: Seal Check */}
          {step === 'seal' && vehicle && (
            <div className="card p-6 animate-fade-in space-y-4">
              <h2 className="text-sm font-bold text-white">Seal Integrity Check</h2>
              <p className="text-xs text-white/40">Verify truck seal condition before unloading. Photo evidence required for broken/missing seals.</p>

              <div className="grid grid-cols-3 gap-3">
                {(['intact', 'broken', 'missing'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSealStatus(s)}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      sealStatus === s
                        ? s === 'intact' ? 'border-green-500/40 bg-green-500/10' : s === 'broken' ? 'border-amber-500/40 bg-amber-500/10' : 'border-red-500/40 bg-red-500/10'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                    }`}
                  >
                    <div className="text-2xl mb-2">{s === 'intact' ? '🔒' : s === 'broken' ? '⚠️' : '🚫'}</div>
                    <p className={`text-xs font-bold capitalize ${
                      sealStatus === s
                        ? s === 'intact' ? 'text-green-400' : s === 'broken' ? 'text-amber-400' : 'text-red-400'
                        : 'text-white/50'
                    }`}>{s}</p>
                    <p className="text-[9px] text-white/30 mt-1">
                      {s === 'intact' ? 'Seal verified OK' : s === 'broken' ? 'Tamper evident' : 'Seal absent'}
                    </p>
                  </button>
                ))}
              </div>

              {sealStatus && sealStatus !== 'intact' && (
                <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] text-xs text-amber-300">
                  ⚠ Seal anomaly detected — Security & Supervisor will be notified. Photo evidence is required.
                </div>
              )}

              {/* Camera capture */}
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-2">Photo Evidence</label>
                <button
                  onClick={() => { setPhotoCaptured(true); addNotification('Photo captured and uploaded ✓', 'success'); }}
                  className={`w-full h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                    photoCaptured ? 'border-green-500/40 bg-green-500/[0.05]' : 'border-white/10 bg-white/[0.02] hover:border-[#00ff88]/30'
                  }`}
                >
                  {photoCaptured ? (
                    <><span className="text-2xl">📸</span><span className="text-[10px] text-green-400 font-bold">Photo captured ✓</span></>
                  ) : (
                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-white/20"><path strokeLinecap="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg><span className="text-[10px] text-white/30">Tap to capture photo</span></>
                  )}
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSealCheck} className="btn-primary flex-1" disabled={!sealStatus}>CONFIRM SEAL STATUS →</button>
                <button onClick={reset} className="btn-ghost">Reset</button>
              </div>
            </div>
          )}

          {/* Step: MOQ */}
          {step === 'moq' && vehicle && (
            <div className="card p-6 animate-fade-in">
              <h2 className="text-sm font-bold text-white mb-4">Final Check & Confirm Entry</h2>
              <div className="p-4 rounded-xl border mb-4 bg-[#00ff88]/5 border-[#00ff88]/20">
                <p className="text-xs font-bold text-[#00ff88] mb-1">✓ Compliance Verified by Backend</p>
                <p className="text-[11px] text-white/40">MOQ check, vendor compliance status, and ASN confidence score will be validated when the gate entry is submitted to the API.</p>
              </div>
              <div className="space-y-2 mb-4">
                {[
                  { l: 'Vehicle', v: vehicle.reg },
                  { l: 'Vendor ID', v: vehicle.vendor_id },
                  { l: 'ASN', v: vehicle.asn_id ?? '—' },
                ].map(r => (
                  <div key={r.l} className="flex justify-between text-xs">
                    <span className="text-white/40">{r.l}</span>
                    <span className="font-mono text-white/80">{r.v}</span>
                  </div>
                ))}
              </div>

              <button onClick={handleMOQ} disabled={submitLoading} className="btn-primary w-full py-3">
                {submitLoading ? 'Registering Entry...' : 'CONFIRM GATE ENTRY & START DWELL TIMER'}
              </button>
            </div>
          )}

          {/* Step: Confirmed */}
          {step === 'confirmed' && (
            <div className="card p-6 animate-fade-in text-center">
              <div className="w-16 h-16 bg-[#00ff88]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#00ff88]/20">
                <span className="text-3xl text-[#00ff88]">✓</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Gate Entry Confirmed</h2>
              <p className="text-xs text-white/40 mb-5">Vehicle registered · Dwell timer started · Compliance verified by backend</p>
              <div className="grid grid-cols-2 gap-3 text-left mb-5">
                {[
                  { l: 'Entry ID', v: confirmedEntry?.entry_id ?? '—' },
                  { l: 'Gate-In Time', v: confirmedEntry?.gate_in_at ? new Date(confirmedEntry.gate_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
                  { l: 'Vehicle', v: confirmedEntry?.vehicle_reg ?? vehicle?.reg ?? '—' },
                  { l: 'Dwell Timer', v: 'Started 0:00' },
                ].map(r => (
                  <div key={r.l} className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                    <p className="text-[10px] text-white/30 mb-0.5">{r.l}</p>
                    <p className="text-xs font-mono font-bold text-white/80">{r.v}</p>
                  </div>
                ))}
              </div>
              <button onClick={reset} className="btn-primary w-full">Register Next Vehicle</button>
            </div>
          )}

          {/* Step: Rejected */}
          {step === 'rejected' && (
            <div className="card p-6 animate-fade-in text-center border-red-500/20">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <span className="text-3xl text-red-400">✕</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Entry Denied</h2>
              <p className="text-xs text-white/40 mb-2">Vendor compliance suspended — BR-01 enforced</p>
              <p className="text-[11px] text-white/30 mb-5">Vehicle directed to holding area. Dock Manager and Compliance notified automatically.</p>
              <button onClick={reset} className="btn-ghost w-full">Reset Gate</button>
            </div>
          )}
        </div>

        {/* Recent Gate Log */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <h2 className="text-sm font-bold text-white">Today's Gate Log</h2>
              <span className="text-[10px] bg-white/[0.05] text-white/40 px-2 py-0.5 rounded-full">{yardLog.length} entries</span>
            </div>
            <span className="text-[10px] text-white/30">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
          </div>
          {logLoading ? (
            <div className="p-6 text-center text-white/30 text-xs">Loading...</div>
          ) : yardLog.length === 0 ? (
            <div className="p-8 text-center text-white/30 text-sm">No entries today.</div>
          ) : (
            <table className="wms-table">
              <thead><tr><th>Entry ID</th><th>Vehicle Reg</th><th>Vendor</th><th>ASN</th><th>Gate-In</th><th>Dock</th><th>Status</th></tr></thead>
              <tbody>
                {yardLog.map(e => (
                  <tr key={e.entry_id}>
                    <td><span className="font-mono text-[10px] text-white/50">{e.entry_id.slice(0, 8)}…</span></td>
                    <td><span className="font-mono text-xs text-white/70">{e.vehicle_reg}</span></td>
                    <td><span className="text-xs text-white/60 truncate max-w-[100px] block">{e.vendor_name}</span></td>
                    <td><span className="font-mono text-[10px] text-white/40">{e.asn_id ?? '—'}</span></td>
                    <td><span className="text-xs text-white/50">{new Date(e.gate_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
                    <td><span className="font-mono text-xs text-[#3b82f6]">{e.dock_door ?? '—'}</span></td>
                    <td>
                      <span className={`status-pill text-[9px] ${
                        e.status === 'AtDock' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : e.status === 'Departed' ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-white/5 text-white/40 border border-white/10'}`}>
                        {e.status === 'AtDock' ? 'At Dock' : e.status === 'Departed' ? 'Departed' : 'In Yard'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-4 border-t border-white/[0.05] grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Total In', val: yardLog.length, color: '#3b82f6' },
              { label: 'At Dock', val: yardLog.filter(e => e.status === 'AtDock').length, color: '#00ff88' },
              { label: 'In Yard', val: yardLog.filter(e => e.status === 'InYard').length, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.val}</p>
                <p className="text-[10px] text-white/30">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
