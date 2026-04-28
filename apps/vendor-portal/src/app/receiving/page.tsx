'use client';

import React, { useState, useEffect } from 'react';
import { useNotifications } from '@/lib/notifications';

type QCStep = 'select' | 'scan' | 'inspect' | 'post';

interface SKULine {
  id: string; sku: string; description: string;
  expected: number; received: number; damaged: number;
  status: 'pending' | 'ok' | 'mismatch'; barcodeMatch: boolean;
}

const ACTIVE_DELIVERIES = [
  { id: 'DEL-5521', vendor: 'Patanjali Foods', asn: 'ASN-9921-A', po: 'PO-88291', dock: 'D-03', items: 4, elapsed: 38 },
  { id: 'DEL-5519', vendor: 'Amul Dairy',       asn: 'ASN-9919-B', po: 'PO-88289', dock: 'D-01', items: 2, elapsed: 72 },
  { id: 'DEL-5516', vendor: 'ITC Ltd',           asn: 'ASN-9916-A', po: 'PO-88285', dock: 'D-05', items: 6, elapsed: 55 },
];

const BASE_LINES: SKULine[] = [
  { id: 'L1', sku: 'SKU-PF-0012', description: 'Patanjali Dalia 500g', expected: 80, received: 0, damaged: 0, status: 'pending', barcodeMatch: true },
  { id: 'L2', sku: 'SKU-PF-0031', description: 'Patanjali Honey 1kg',  expected: 60, received: 0, damaged: 0, status: 'pending', barcodeMatch: true },
  { id: 'L3', sku: 'SKU-PF-0047', description: 'Patanjali Ghee 500ml', expected: 50, received: 0, damaged: 0, status: 'pending', barcodeMatch: false },
  { id: 'L4', sku: 'SKU-PF-0093', description: 'Patanjali Atta 5kg',   expected: 50, received: 0, damaged: 0, status: 'pending', barcodeMatch: true },
];

function BarcodeScanner({ onScan }: { onScan: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    if (!scanning) return;
    const id = setInterval(() => setPos(p => (p + 3) % 100), 20);
    return () => clearInterval(id);
  }, [scanning]);

  return (
    <div
      className="relative w-full h-36 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] overflow-hidden cursor-pointer flex flex-col items-center justify-center gap-3 hover:border-[#00ff88]/30 transition-all"
      onClick={() => { if (scanning) return; setScanning(true); setTimeout(() => { setScanning(false); onScan(); }, 1800); }}
    >
      {scanning ? (
        <>
          <div className="flex items-end gap-[2px] h-12 px-8">
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{ height: `${28 + Math.sin(i * 0.7) * 18}px`, background: `rgba(0,255,136,${0.3 + Math.abs(Math.sin(i * 0.5)) * 0.5})` }} />
            ))}
          </div>
          <div className="absolute left-4 right-4 h-0.5 rounded-full" style={{ top: `${pos}%`, background: 'linear-gradient(90deg,transparent,#00ff88,transparent)', boxShadow: '0 0 8px #00ff88' }} />
          <p className="text-[10px] text-[#00ff88]/70 animate-pulse z-10">Scanning barcode…</p>
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-white/20">
            <rect x="2" y="4" width="5" height="16" rx="1" /><rect x="9" y="4" width="2" height="16" rx="0.5" />
            <rect x="13" y="4" width="4" height="16" rx="1" /><rect x="19" y="4" width="3" height="16" rx="0.5" />
          </svg>
          <p className="text-[10px] text-white/30">Tap to simulate barcode scan</p>
        </>
      )}
    </div>
  );
}

const STEPS = ['select', 'scan', 'inspect', 'post'] as const;
const STEP_LABELS = ['Select', 'QC Scan', 'Inspect', 'Post GRN'];

export default function ReceivingPage() {
  const { addNotification } = useNotifications();
  const [step, setStep] = useState<QCStep>('select');
  const [selected, setSelected] = useState<typeof ACTIVE_DELIVERIES[0] | null>(null);
  const [lines, setLines] = useState<SKULine[]>(BASE_LINES);
  const [idx, setIdx] = useState(0);
  const [autoGrn, setAutoGrn] = useState(false);
  const [posted, setPosted] = useState(false);
  const [grnRef, setGrnRef] = useState('');

  const handleSelect = (d: typeof ACTIVE_DELIVERIES[0]) => {
    setSelected(d); setLines(BASE_LINES.map(l => ({ ...l, received: 0, damaged: 0, status: 'pending' }))); setIdx(0); setStep('scan');
    addNotification(`Delivery ${d.id} loaded — start scanning`, 'info');
  };

  const handleScan = () => {
    const line = lines[idx];
    const rec = line.barcodeMatch ? line.expected : line.expected - Math.floor(Math.random() * 5 + 1);
    const status = line.barcodeMatch ? 'ok' : 'mismatch';
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, received: rec, status } : l));
    if (!line.barcodeMatch) addNotification(`Barcode mismatch on ${line.sku}`, 'warning');
    else addNotification(`${line.sku} scanned ✓`, 'success');
    if (idx < lines.length - 1) setIdx(i => i + 1);
    else { setStep('inspect'); addNotification('All SKUs scanned — inspect now', 'info'); }
  };

  const handleInspect = () => { setAutoGrn(lines.every(l => l.status === 'ok')); setStep('post'); };

  const handlePost = () => {
    setGrnRef(`GRN-${Date.now().toString().slice(-6)}`); setPosted(true);
    addNotification(autoGrn ? 'Auto-GRN posted to SAP ✓' : 'GRN with exceptions posted', autoGrn ? 'success' : 'warning');
  };

  const reset = () => { setStep('select'); setSelected(null); setPosted(false); setLines(BASE_LINES); setIdx(0); };

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
              <h2 className="text-sm font-bold text-white">Select Active Delivery</h2>
              <p className="text-xs text-white/40">Choose a delivery at dock to begin QC scanning.</p>
              {ACTIVE_DELIVERIES.map(d => (
                <button key={d.id} onClick={() => handleSelect(d)} className="w-full text-left p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-[#00ff88]/30 hover:bg-[#00ff88]/[0.03] transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-white/70">{d.id}</span>
                    <span className="font-mono text-[10px] text-[#3b82f6]">{d.dock}</span>
                  </div>
                  <p className="text-sm font-semibold text-white group-hover:text-[#00ff88] transition-colors">{d.vendor}</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-white/40">
                    <span>{d.asn}</span><span>·</span><span>{d.items} SKU lines</span><span>·</span><span>{d.elapsed}m dwell</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step: Scan */}
          {step === 'scan' && selected && (
            <div className="card p-6 animate-fade-in space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Barcode QC Scan</h2>
                <span className="text-[10px] text-white/40 font-mono">{idx + 1} / {lines.length}</span>
              </div>
              <div className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <p className="text-[10px] text-white/40 mb-1">Current SKU</p>
                <p className="text-sm font-bold text-white">{lines[idx]?.description}</p>
                <p className="text-[10px] font-mono text-white/40 mt-0.5">{lines[idx]?.sku}</p>
                <p className="text-[10px] text-white/30 mt-1">Expected: <span className="text-white/60 font-bold">{lines[idx]?.expected} units</span></p>
              </div>
              <BarcodeScanner onScan={handleScan} />
              <div className="space-y-1.5">
                {lines.map((l, i) => (
                  <div key={l.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${i === idx ? 'border-[#00ff88]/30 bg-[#00ff88]/[0.04]' : l.status === 'ok' ? 'border-green-500/20 bg-green-500/[0.03]' : l.status === 'mismatch' ? 'border-amber-500/20 bg-amber-500/[0.03]' : 'border-white/[0.05]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === idx ? 'bg-[#00ff88] animate-pulse' : l.status === 'ok' ? 'bg-green-400' : l.status === 'mismatch' ? 'bg-amber-400' : 'bg-white/20'}`} />
                    <span className="text-xs text-white/60 flex-1 truncate">{l.description}</span>
                    <span className={`text-[10px] font-bold ${l.status === 'ok' ? 'text-green-400' : l.status === 'mismatch' ? 'text-amber-400' : i === idx ? 'text-[#00ff88]' : 'text-white/20'}`}>
                      {l.status === 'ok' ? '✓' : l.status === 'mismatch' ? '⚠' : i === idx ? '●' : '○'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Inspect */}
          {step === 'inspect' && (
            <div className="card p-6 animate-fade-in space-y-4">
              <h2 className="text-sm font-bold text-white">Physical Inspection</h2>
              <p className="text-xs text-white/40">Record damaged units and confirm count before GRN.</p>
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={l.id} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/80">{l.description}</span>
                      <span className={`status-pill text-[9px] ${l.status === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                        {l.status === 'ok' ? '✓ Match' : '⚠ Mismatch'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-[10px]">
                      <span className="text-white/40">Expected: <span className="text-white/70 font-bold">{l.expected}</span></span>
                      <span className="text-white/40">Received: <span className="text-white/70 font-bold">{l.received}</span></span>
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
                    <p className="text-[10px] text-white/40 mt-0.5">{autoGrn ? 'All barcodes matched — will auto-post to SAP' : `${lines.filter(l => l.status === 'mismatch').length} mismatch(es) — discrepancy report will be raised`}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
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
                {[{ l: 'GRN Reference', v: grnRef }, { l: 'Posted At', v: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, { l: 'Total Lines', v: `${lines.length}` }, { l: 'Exceptions', v: `${lines.filter(l => l.status === 'mismatch').length}` }].map(r => (
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
