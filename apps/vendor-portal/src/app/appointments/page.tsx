'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface ScheduleBoardEntry {
  appointment_id: string;
  vendor_name: string;
  dock_door: string;
  slot_start: string;
  slot_end: string;
  status: string;
  is_heavy_truck: boolean;
  dwell_time_minutes: number | null;
}

interface AppointmentResponse {
  appointment_id: string;
  dock_door: string;
  slot_start: string;
  slot_end: string;
  status: string;
}

interface SlotInfo {
  dock: string;
  slotStart: Date;
  slotEnd: Date;
  booked: boolean;
  booking?: ScheduleBoardEntry;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const DOCKS = ['D-01', 'D-02', 'D-03', 'D-04', 'D-05'];
// 2-hour slots: 08:00-10:00, 10:00-12:00, 12:00-14:00, 14:00-16:00, 16:00-18:00
const SLOT_HOURS = [8, 10, 12, 14, 16];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function slotISO(date: Date, hour: number) {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDayLabel(d: Date) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  if (isoDate(d) === isoDate(today)) return 'Today';
  if (isoDate(d) === isoDate(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
}

function isSlotBooked(entries: ScheduleBoardEntry[], dock: string, slotStart: Date, slotEnd: Date): ScheduleBoardEntry | undefined {
  return entries.find(e => {
    if (e.dock_door !== dock) return false;
    const eStart = new Date(e.slot_start);
    const eEnd = new Date(e.slot_end);
    return eStart < slotEnd && eEnd > slotStart;
  });
}

function isHeavyTruckSlot(hour: number) {
  return hour >= 12 && hour + 2 <= 16;
}

/* ─── Booking Modal ──────────────────────────────────────────────────────── */
function BookingModal({
  slot,
  onClose,
  onConfirm,
  isHeavyTruck,
  prefilledAsnId,
}: {
  slot: SlotInfo;
  onClose: () => void;
  onConfirm: (asnId: string, isHeavy: boolean) => Promise<void>;
  isHeavyTruck: boolean;
  prefilledAsnId?: string;
}) {
  const [asnId, setAsnId] = useState('');
  const [heavy, setHeavy] = useState(isHeavyTruck);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!asnId.trim()) { setError('ASN ID is required'); return; }
    setLoading(true);
    setError('');
    try {
      await onConfirm(asnId.trim(), heavy);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Booking failed');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefilledAsnId) setAsnId(prefilledAsnId);
  }, [prefilledAsnId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-md animate-fade-in">
        <h2 className="text-base font-bold text-white mb-1">Confirm Booking</h2>
        <p className="text-xs text-white/40 mb-5">
          {slot.dock} · {formatTime(slot.slotStart.toISOString())} – {formatTime(slot.slotEnd.toISOString())}
          · {slot.slotStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>

        {!isHeavyTruckSlot(slot.slotStart.getHours()) && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
            ⚠ Heavy trucks (40ft) can only book 12:00–16:00 slots. This slot is standard trucks only.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              ASN Reference *
            </label>
            <input
              type="text"
              value={asnId}
              onChange={e => setAsnId(e.target.value)}
              placeholder="e.g. ASN-9921-A"
              className="input-field"
              autoFocus
            />
            <p className="text-[10px] text-white/25 mt-1">Must be a Submitted or Active ASN</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Vehicle Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Standard (20ft)', value: false },
                { label: 'Heavy Duty (40ft)', value: true },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setHeavy(opt.value)}
                  className={`p-3 rounded-xl text-xs font-semibold border transition-all ${heavy === opt.value
                    ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]'
                    : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:border-white/20'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {heavy && !isHeavyTruckSlot(slot.slotStart.getHours()) && (
              <p className="text-[10px] text-red-400 mt-1">
                ✕ Heavy trucks cannot be booked in this time slot
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-white/40 hover:text-white border border-white/[0.06] hover:border-white/20 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (heavy && !isHeavyTruckSlot(slot.slotStart.getHours()))}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88] hover:bg-[#00ff88]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Booking...' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Success Card ─────────────────────────────────────────────────────────── */
function SuccessCard({ appt, onNew }: { appt: AppointmentResponse; onNew: () => void }) {
  const slipDate = new Date(appt.slot_start).toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const slipTime = `${formatTime(appt.slot_start)} – ${formatTime(appt.slot_end)}`;

  const handleDownload = () => {
    // Build a clean HTML slip and open in new tab for printing
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Delivery Appointment Slip</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #fff; color: #111; padding: 40px; max-width: 480px; margin: 0 auto; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .logo-box { width: 28px; height: 28px; background: #00c853; border-radius: 5px; transform: rotate(12deg); }
    .logo-text { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
    .badge { display: inline-block; background: #e8fff3; color: #00a844; border: 1px solid #00c853; border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .row:last-child { border-bottom: none; }
    .label { color: #888; font-size: 12px; }
    .value { font-size: 13px; font-weight: 700; }
    .value.green { color: #00a844; }
    .value.mono { font-family: monospace; font-size: 11px; color: #555; }
    .dock-big { text-align: center; background: #f0fdf4; border: 2px solid #00c853; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
    .dock-big .dock-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .dock-big .dock-num { font-size: 36px; font-weight: 900; color: #00a844; }
    .dock-big .dock-time { font-size: 14px; color: #555; margin-top: 4px; }
    .notice { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; font-size: 12px; color: #92400e; margin-bottom: 20px; }
    .footer { text-align: center; font-size: 11px; color: #aaa; margin-top: 24px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-box"></div>
    <span class="logo-text">SUMOSAVE WMS</span>
  </div>
  <div class="badge">✓ CONFIRMED</div>
  <h1>Delivery Appointment</h1>
  <p class="sub">Dock slot reserved and confirmed by WMS</p>

  <div class="dock-big">
    <div class="dock-label">ASSIGNED DOCK</div>
    <div class="dock-num">${appt.dock_door}</div>
    <div class="dock-time">${slipTime} &nbsp;·&nbsp; ${slipDate}</div>
  </div>

  <div class="card">
    <div class="row"><span class="label">Appointment ID</span><span class="value mono">${appt.appointment_id}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${slipDate}</span></div>
    <div class="row"><span class="label">Time Slot</span><span class="value">${slipTime}</span></div>
    <div class="row"><span class="label">Dock Door</span><span class="value">${appt.dock_door}</span></div>
    <div class="row"><span class="label">Status</span><span class="value green">${appt.status}</span></div>
  </div>

  <div class="notice">
    ⚠ Please arrive <strong>15 minutes before</strong> your slot time. Gate staff will verify your vehicle registration and ASN reference. Late arrivals may forfeit the slot.
  </div>

  <div class="footer">
    SumoSave WMS · DC Bangalore · Generated ${new Date().toLocaleString('en-IN')}
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        setTimeout(() => win.print(), 300);
      };
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="max-w-lg mx-auto mt-8 card p-8 text-center animate-fade-in">
      {/* Success icon */}
      <div className="w-14 h-14 rounded-full bg-[#00ff88]/10 flex items-center justify-center mx-auto mb-5 border border-[#00ff88]/20">
        <svg className="w-7 h-7 text-[#00ff88]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-white mb-1">Appointment Confirmed</h2>
      <p className="text-white/40 text-sm mb-6">Your dock slot is reserved and confirmed.</p>

      {/* Dock highlight */}
      <div className="bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl p-5 mb-5">
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Assigned Dock</p>
        <p className="text-4xl font-black text-[#00ff88] mb-1">{appt.dock_door}</p>
        <p className="text-sm text-white/60">{slipTime}</p>
        <p className="text-xs text-white/40 mt-0.5">{slipDate}</p>
      </div>

      {/* Details */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-left space-y-2 mb-5">
        {[
          { label: 'Appointment ID', value: appt.appointment_id, mono: true, color: 'text-[#00ff88]' },
          { label: 'Dock', value: appt.dock_door, mono: false, color: 'text-white font-bold' },
          { label: 'Slot', value: slipTime, mono: false, color: 'text-white' },
          { label: 'Date', value: slipDate, mono: false, color: 'text-white' },
          { label: 'Status', value: appt.status, mono: false, color: 'text-[#22c55e] font-bold' },
        ].map(r => (
          <div key={r.label} className="flex justify-between items-center text-xs py-1 border-b border-white/[0.04] last:border-0">
            <span className="text-white/40">{r.label}</span>
            <span className={`${r.mono ? 'font-mono text-[10px]' : ''} ${r.color}`}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Notice */}
      <div className="p-3 bg-[#00ff88]/5 border border-[#00ff88]/10 rounded-xl text-xs text-[#00ff88]/70 mb-6 text-left">
        Please arrive <strong className="text-[#00ff88]">15 minutes before</strong> your slot. Gate staff will verify your vehicle and ASN reference at entry.
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={onNew} className="btn-primary text-sm px-6 py-2.5 rounded-xl">
          Book Another Slot
        </button>
        <button
          onClick={handleDownload}
          className="text-sm px-6 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 18l5 5 5-5M12 23V11" />
          </svg>
          Download Slip
        </button>
      </div>
    </div>
  );
}

/* ─── ASN Dropdown (custom — native select has invisible options on Windows dark theme) ── */
function AsnDropdown({
  asns,
  value,
  onChange,
  loading,
}: {
  asns: any[];
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = asns.find(a => a.asn_id === value);
  const label = selected
    ? `${selected.asn_id.slice(0, 8)}… · Score: ${selected.confidence_score ?? '—'} · ${selected.status}`
    : '— Select from your submitted ASNs —';

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-[#0d1117] border border-white/[0.15] rounded-xl px-4 py-2.5 text-sm text-white hover:border-blue-500/40 transition-all cursor-pointer"
      >
        <span className={selected ? 'text-white' : 'text-white/40'}>{label}</span>
        <svg className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-[#0d1117] border border-white/[0.15] rounded-xl overflow-hidden shadow-2xl">
          {/* Default option */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/[0.06] ${!value ? 'text-white/60 bg-white/[0.03]' : 'text-white/40'}`}
          >
            — Select from your submitted ASNs —
          </button>

          {loading && (
            <div className="px-4 py-3 text-xs text-white/30 animate-pulse">Loading ASNs…</div>
          )}

          {!loading && asns.length === 0 && (
            <div className="px-4 py-3 text-xs text-amber-400">
              No submitted ASNs found. Submit an ASN first.
            </div>
          )}

          {asns.map(asn => (
            <button
              key={asn.asn_id}
              type="button"
              onClick={() => { onChange(asn.asn_id); setOpen(false); }}
              className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-[#3b82f6]/10 border-t border-white/[0.05] ${value === asn.asn_id ? 'bg-[#3b82f6]/10 text-[#3b82f6]' : 'text-white'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs">{asn.asn_id.slice(0, 8)}…</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    (asn.confidence_score ?? 0) >= 80 ? 'bg-green-500/15 text-green-400' :
                    (asn.confidence_score ?? 0) >= 60 ? 'bg-amber-500/15 text-amber-400' :
                    'bg-red-500/15 text-red-400'
                  }`}>
                    Score: {asn.confidence_score ?? '—'}
                  </span>
                  <span className="text-[10px] text-white/40">{asn.status}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AppointmentsPage() {
  const { addNotification } = useNotifications();

  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleBoardEntry[]>([]);
  const [docks, setDocks] = useState<string[]>(['D-01', 'D-02', 'D-03', 'D-04', 'D-05']);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [confirmed, setConfirmed] = useState<AppointmentResponse | null>(null);
  const [availableAsns, setAvailableAsns] = useState<any[]>([]);
  const [selectedAsnId, setSelectedAsnId] = useState('');
  const [asnLoading, setAsnLoading] = useState(false);

  // Build week days starting from today + weekOffset * 7
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = addDays(today, weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const fetchData = useCallback(async () => {
    const dcId = auth.getDcId();
    const vendorId = auth.getVendorId();
    setLoading(true);
    setAsnLoading(true);
    try {
      const [scheduleData, zoneData, asnData] = await Promise.all([
        api.get<ScheduleBoardEntry[]>(`/api/v1/appointments/schedule?dc_id=${dcId}`),
        api.get<any[]>(`/api/v1/admin/dock-zones?dc_id=${dcId}`).catch(() => []),
        api.get<any[]>(`/api/v1/asns?status=Submitted`).catch(() => []),
      ]);
      
      setScheduleEntries(Array.isArray(scheduleData) ? scheduleData : []);
      setAvailableAsns(Array.isArray(asnData) ? asnData : []);
      if (zoneData.length > 0) {
        setDocks(zoneData.map(z => z.zone_id));
      }
    } catch {
      setScheduleEntries([]);
    } finally {
      setLoading(false);
      setAsnLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, weekOffset]);

  const handleSlotClick = (dock: string, day: Date, hour: number) => {
    if (!selectedAsnId) {
      addNotification('Please select an ASN from the dropdown first', 'warning');
      return;
    }
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(day);
    slotEnd.setHours(hour + 2, 0, 0, 0);
    const booking = isSlotBooked(scheduleEntries, dock, slotStart, slotEnd);
    if (booking) return; // already booked
    if (slotStart <= new Date()) return; // past slot
    setSelectedSlot({ dock, slotStart, slotEnd, booked: false });
  };

  const handleBookingConfirm = async (asnId: string, isHeavyTruck: boolean) => {
    if (!selectedSlot) return;

    const result = await api.post<AppointmentResponse>('/api/v1/appointments', {
      dc_id: auth.getDcId(),
      asn_id: asnId,
      vendor_id: auth.getUserId(), 
      dock_door: selectedSlot.dock,
      slot_start: selectedSlot.slotStart.toISOString(),
      slot_end: selectedSlot.slotEnd.toISOString(),
      is_heavy_truck: isHeavyTruck,
    });

    setSelectedSlot(null);
    setConfirmed(result);
    addNotification(`Dock ${result.dock_door} booked successfully!`, 'success');
    fetchData(); // refresh calendar
  };

  if (confirmed) {
    return (
      <div className="p-4 sm:p-6">
        <SuccessCard appt={confirmed} onNew={() => setConfirmed(null)} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Schedule Delivery Appointment</h1>
          <p className="text-xs text-white/40 mt-0.5">
            Click any available slot to book · Heavy trucks (40ft) are restricted to 12:00–16:00
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            disabled={weekOffset <= 0}
            className="p-2 rounded-lg border border-white/[0.06] text-white/40 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30"
          >
            ←
          </button>
          <span className="text-xs text-white/50 min-w-[120px] text-center">
            {weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} –{' '}
            {addDays(weekStart, 6).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            disabled={weekOffset >= 3}
            className="p-2 rounded-lg border border-white/[0.06] text-white/40 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>

      {/* ASN Selector */}
      <div className="card p-4 mb-6 bg-[#3b82f6]/5 border-[#3b82f6]/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">
              Step 1: Select Active ASN to Book Slot
            </label>
            {/* Custom dropdown — native select has invisible options on Windows dark theme */}
            <AsnDropdown
              asns={availableAsns}
              value={selectedAsnId}
              onChange={setSelectedAsnId}
              loading={asnLoading}
            />
          </div>
          <div className="pt-5">
            {selectedAsnId && (
              <span className="text-[10px] text-green-400 italic">ASN selected ✓</span>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {[
          { color: 'bg-[#00ff88]/10 border-[#00ff88]/20', label: 'Available' },
          { color: 'bg-red-500/10 border-red-500/20', label: 'Booked' },
          { color: 'bg-white/[0.02] border-white/[0.04]', label: 'Past / Unavailable' },
          { color: 'bg-amber-500/10 border-amber-500/20', label: 'Heavy Truck Window' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${l.color}`} />
            <span className="text-[10px] text-white/40">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="card overflow-hidden">
        {/* Header row — days */}
        <div className="grid border-b border-white/[0.05]" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
          <div className="p-3 border-r border-white/[0.05]" /> {/* dock label col */}
          {weekDays.map(day => {
            const isPast = day < today;
            return (
              <div key={isoDate(day)}
                className={`p-2 text-center border-r border-white/[0.05] last:border-r-0 ${isPast ? 'opacity-40' : ''}`}>
                <p className="text-[10px] font-bold text-white/60">{formatDayLabel(day)}</p>
                <p className="text-[9px] text-white/25 mt-0.5">
                  {day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            );
          })}
        </div>

        {/* Dock rows */}
        {loading ? (
          <div className="p-8 text-center text-white/30 text-sm">Loading schedule...</div>
        ) : (
          DOCKS.map(dock => (
            <div key={dock} className="grid border-b border-white/[0.05] last:border-b-0"
              style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
              {/* Dock label */}
              <div className="p-3 border-r border-white/[0.05] flex items-center justify-center">
                <span className="font-mono text-xs font-bold text-[#3b82f6]">{dock}</span>
              </div>

              {/* Slots per day */}
              {weekDays.map(day => {
                const isPast = day < today;
                return (
                  <div key={isoDate(day)} className="border-r border-white/[0.05] last:border-r-0 p-1 space-y-1">
                    {SLOT_HOURS.map(hour => {
                      const slotStart = new Date(day);
                      slotStart.setHours(hour, 0, 0, 0);
                      const slotEnd = new Date(day);
                      slotEnd.setHours(hour + 2, 0, 0, 0);

                      const booking = isSlotBooked(scheduleEntries, dock, slotStart, slotEnd);
                      const isPastSlot = slotStart <= new Date();
                      const isHeavy = isHeavyTruckSlot(hour);
                      const available = !booking && !isPastSlot && !isPast;

                      let bg = 'bg-white/[0.02] border-white/[0.04] cursor-not-allowed opacity-40';
                      if (booking) bg = 'bg-red-500/10 border-red-500/20 cursor-not-allowed';
                      else if (available && isHeavy) bg = 'bg-amber-500/5 border-amber-500/15 hover:bg-amber-500/10 cursor-pointer';
                      else if (available) bg = 'bg-[#00ff88]/5 border-[#00ff88]/15 hover:bg-[#00ff88]/10 cursor-pointer';

                      return (
                        <div
                          key={hour}
                          onClick={() => available && handleSlotClick(dock, day, hour)}
                          className={`rounded border p-1 transition-all duration-150 ${bg}`}
                          title={booking ? `Booked: ${booking.vendor_name}` : `${hour}:00–${hour + 2}:00`}
                        >
                          <p className="text-[9px] text-center font-mono leading-tight text-white/50">
                            {hour}:00
                          </p>
                          {booking && (
                            <p className="text-[8px] text-center text-red-400 truncate mt-0.5 leading-tight">
                              {booking.vendor_name.split(' ')[0]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Upcoming bookings (my appointments) */}
      {scheduleEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-white mb-3">Upcoming Confirmed Slots</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scheduleEntries.slice(0, 6).map(e => (
              <div key={e.appointment_id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-[#3b82f6] font-bold">{e.dock_door}</span>
                  <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded">{e.status}</span>
                </div>
                <p className="text-xs font-semibold text-white truncate">{e.vendor_name}</p>
                <p className="text-[10px] text-white/40 mt-1">
                  {new Date(e.slot_start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  {' · '}{formatTime(e.slot_start)} – {formatTime(e.slot_end)}
                </p>
                {e.is_heavy_truck && (
                  <span className="text-[9px] text-amber-400 mt-1 block">Heavy Truck</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {selectedSlot && (
        <BookingModal
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onConfirm={handleBookingConfirm}
          isHeavyTruck={false}
          prefilledAsnId={selectedAsnId}
        />
      )}
    </div>
  );
}
