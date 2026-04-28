'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/lib/notifications';
import { api, auth } from '@/lib/api';

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface YardQueueEntry {
  entry_id: string;
  vehicle_reg: string;
  vendor_id: string;
  vendor_name: string;
  asn_id: string | null;
  appointment_id: string | null;
  gate_in_at: string;
  dock_assigned_at: string | null;
  status: 'InYard' | 'AtDock' | 'Departed';
  dwell_seconds: number;
  dock_door: string | null;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function dwellMinutes(seconds: number) { return Math.round(seconds / 60); }

function formatGateIn(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function dwellColor(minutes: number) {
  if (minutes > 90) return '#ef4444';
  if (minutes > 60) return '#f59e0b';
  return '#22c55e';
}

/* ─── Dwell Timer Ring ─────────────────────────────────────────────────────── */
function DwellTimer({ minutes, limit = 90 }: { minutes: number; limit?: number }) {
  const pct = Math.min((minutes / limit) * 100, 100);
  const color = dwellColor(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const circ = 75.4;
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8">
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle cx="16" cy="16" r="12" fill="none" stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            transform="rotate(-90 16 16)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        </div>
      </div>
      <div>
        <p className="text-xs font-mono font-bold" style={{ color }}>
          {h > 0 ? `${h}h ${m}m` : `${m}m`}
        </p>
        <p className="text-[9px] text-white/25">/ {limit}m limit</p>
      </div>
    </div>
  );
}

/* ─── Assign Dock Modal ──────────────────────────────────────────────────── */
function AssignDockModal({
  entry,
  occupiedDocks,
  availableDocks,
  onClose,
  onAssigned,
}: {
  entry: YardQueueEntry;
  occupiedDocks: string[];
  availableDocks: string[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { addNotification } = useNotifications();
  const [selectedDock, setSelectedDock] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAssign = async () => {
    if (!selectedDock) { setError('Select a dock door'); return; }
    setLoading(true);
    setError('');
    try {
      await api.patch(`/api/v1/yard/${entry.entry_id}/assign-dock`, { dock_door: selectedDock });
      addNotification(`${entry.vehicle_reg} assigned to ${selectedDock}`, 'success');
      onAssigned();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assignment failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-sm animate-fade-in">
        <h2 className="text-sm font-bold text-white mb-1">Assign Dock</h2>
        <p className="text-xs text-white/40 mb-5 font-mono">{entry.vehicle_reg} · {entry.vendor_name}</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {availableDocks.map(d => {
            const occupied = occupiedDocks.includes(d);
            const preferred = entry.dock_door === d;
            return (
              <button key={d} type="button"
                onClick={() => !occupied && setSelectedDock(d)}
                disabled={occupied}
                className={`p-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                  selectedDock === d
                    ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]'
                    : occupied
                    ? 'bg-red-500/5 border-red-500/10 text-red-400/40 cursor-not-allowed'
                    : preferred
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:border-amber-400/40'
                    : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:border-white/20 cursor-pointer'
                }`}
                title={occupied ? 'Occupied' : preferred ? 'Booked slot dock' : ''}
              >
                {d}
                {occupied && <div className="text-[8px] text-red-400/60 mt-0.5">Busy</div>}
                {preferred && !occupied && <div className="text-[8px] text-amber-400/70 mt-0.5">Booked</div>}
              </button>
            );
          })}
        </div>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-white/40 border border-white/[0.06] hover:text-white hover:border-white/20 transition-colors">Cancel</button>
          <button onClick={handleAssign} disabled={loading || !selectedDock}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88] hover:bg-[#00ff88]/20 transition-colors disabled:opacity-40">
            {loading ? 'Assigning...' : 'Assign →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function DockQueuePage() {
  const { addNotification } = useNotifications();
  const [queue, setQueue] = useState<YardQueueEntry[]>([]);
  const [docks, setDocks] = useState<string[]>(['D-01', 'D-02', 'D-03', 'D-04', 'D-05', 'D-06', 'D-07', 'D-08']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<YardQueueEntry | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<YardQueueEntry | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    const dcId = auth.getDcId();
    try {
      const [queueData, zoneData] = await Promise.all([
        api.get<YardQueueEntry[]>(`/api/v1/yard/queue?dc_id=${dcId}`),
        api.get<any[]>(`/api/v1/admin/dock-zones?dc_id=${dcId}`).catch(() => []), 
      ]);
      
      setQueue(Array.isArray(queueData) ? queueData : []);
      
      if (zoneData.length > 0) {
        setDocks(zoneData.map(z => z.zone_id));
      }
      
      setLastRefresh(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load yard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000); 
    return () => clearInterval(id);
  }, [fetchData]);

  // Derive dock cards from live queue
  const atDock = queue.filter(e => e.status === 'AtDock');
  const inYard  = queue.filter(e => e.status === 'InYard');
  const occupiedDocks = atDock.map(e => e.dock_door).filter(Boolean) as string[];

  const breachedDwells = queue.filter(e => dwellMinutes(e.dwell_seconds) > 90).length;
  const activeDocks = atDock.length;
  const availDocks = docks.length - occupiedDocks.length;

  // Build dock status map
  const dockMap: Record<string, YardQueueEntry | null> = {};
  for (const d of docks) dockMap[d] = atDock.find(e => e.dock_door === d) ?? null;

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fade-in max-w-[1400px]">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Dock Queue</h1>
          <p className="text-xs text-white/40 mt-0.5">Live dock status · Yard queue · Dwell timer governance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {breachedDwells > 0 && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {breachedDwells} Dwell Breach{breachedDwells > 1 ? 'es' : ''}
            </div>
          )}
          <div className="text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
            {activeDocks} Active · {availDocks} Available
          </div>
          <button onClick={fetchData} className="text-xs text-white/40 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors">
            ↻ {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">⚠ {error}</div>
      )}

      {/* Dock Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36" />)
          : docks.map(dockId => {
              const entry = dockMap[dockId];
              const minutes = entry ? dwellMinutes(entry.dwell_seconds) : 0;
              const isBreached = minutes > 90;
              const isActive = !!entry;
              const color = isActive ? '#3b82f6' : '#22c55e';
              const bg = isActive ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.05)';

              return (
                <button key={dockId}
                  onClick={() => entry && setSelectedEntry(selectedEntry?.entry_id === entry.entry_id ? null : entry)}
                  className="text-left rounded-xl p-4 border transition-all duration-200 hover:border-white/20 cursor-pointer"
                  style={{ background: bg, borderColor: isBreached ? 'rgba(239,68,68,0.4)' : `${color}20` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-sm font-bold text-white">{dockId}</span>
                    <div className="flex items-center gap-1.5">
                      {isBreached && <span className="text-[9px] text-red-400 bg-red-500/10 rounded px-1.5 py-0.5 font-bold">BREACH</span>}
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-400 animate-pulse' : 'bg-green-400'}`} />
                    </div>
                  </div>
                  <p className="text-xs font-semibold mb-2" style={{ color }}>
                    {isActive ? 'Active' : 'Available'}
                  </p>
                  {entry ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-white/80 font-medium truncate">{entry.vendor_name}</p>
                      <p className="text-[10px] text-white/35 font-mono">{entry.vehicle_reg}</p>
                      {entry.asn_id && (
                        <p className="text-[10px] text-white/30 font-mono truncate">{entry.asn_id}</p>
                      )}
                      <div className="mt-2">
                        <DwellTimer minutes={minutes} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/30 mt-2">Ready to receive</p>
                  )}
                </button>
              );
            })}
      </div>

      {/* Detail panel */}
      {selectedEntry && (
        <div className="card p-5 border-l-2 border-[#3b82f6] animate-fade-in">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#3b82f6]">{selectedEntry.dock_door}</span>
                <span className="text-xs text-white/40">— Delivery Detail</span>
              </div>
              <p className="text-white font-semibold mt-1">{selectedEntry.vendor_name}</p>
            </div>
            <button onClick={() => setSelectedEntry(null)} className="text-white/30 hover:text-white/60 text-lg cursor-pointer">✕</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Vehicle Reg', val: selectedEntry.vehicle_reg },
              { label: 'ASN Number', val: selectedEntry.asn_id ?? '—' },
              { label: 'Gate In', val: formatGateIn(selectedEntry.gate_in_at) },
              { label: 'Dock', val: selectedEntry.dock_door ?? '—' },
              { label: 'Status', val: selectedEntry.status },
              { label: 'Appointment', val: selectedEntry.appointment_id ?? 'Walk-in' },
            ].map((r, i) => (
              <div key={i}>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{r.label}</p>
                <p className="text-sm font-mono text-white/80">{r.val}</p>
              </div>
            ))}
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Dwell Time</p>
              <DwellTimer minutes={dwellMinutes(selectedEntry.dwell_seconds)} />
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => { addNotification(`Escalation raised for ${selectedEntry.dock_door}`, 'warning'); }}
              className="btn-danger">
              Escalate Dwell
            </button>
            <button
              onClick={() => { setAssignTarget(selectedEntry); setSelectedEntry(null); }}
              className="btn-ghost">
              Reassign Dock
            </button>
          </div>
        </div>
      )}

      {/* Yard Queue Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <div className="live-dot" />
            <h2 className="text-sm font-bold text-white">Yard Queue</h2>
            <span className="text-[10px] bg-white/[0.05] text-white/40 px-2 py-0.5 rounded-full">{inYard.length} waiting</span>
          </div>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : inYard.length === 0 ? (
          <div className="p-10 text-center text-white/30 text-sm">No vehicles waiting in yard.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Vehicle Reg</th>
                  <th>Vendor</th>
                  <th>ASN</th>
                  <th>Gate In</th>
                  <th>Dwell</th>
                  <th>Appt. Dock</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {inYard.map(v => {
                  const mins = dwellMinutes(v.dwell_seconds);
                  const isOverdue = mins > 90;
                  return (
                    <tr key={v.entry_id}>
                      <td><span className="font-mono text-xs text-white/80">{v.vehicle_reg}</span></td>
                      <td><span className="text-xs text-white/70 truncate max-w-[140px] block">{v.vendor_name}</span></td>
                      <td><span className="font-mono text-[10px] text-white/40">{v.asn_id ?? '—'}</span></td>
                      <td><span className="text-xs text-white/50">{formatGateIn(v.gate_in_at)}</span></td>
                      <td>
                        <span className="text-xs font-mono font-bold" style={{ color: dwellColor(mins) }}>
                          {mins}m {isOverdue && '⚠'}
                        </span>
                      </td>
                      <td>
                        {v.dock_door
                          ? <span className="font-mono text-xs text-amber-400">{v.dock_door}</span>
                          : <span className="text-[10px] text-white/25">No booking</span>}
                      </td>
                      <td>
                        <button
                          onClick={() => setAssignTarget(v)}
                          className="text-[10px] text-[#00ff88]/60 hover:text-[#00ff88] font-bold tracking-wider transition-colors cursor-pointer">
                          ASSIGN DOCK →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {assignTarget && (
        <AssignDockModal
          entry={assignTarget}
          occupiedDocks={occupiedDocks}
          availableDocks={docks}
          onClose={() => setAssignTarget(null)}
          onAssigned={fetchData}
        />
      )}
    </div>
  );
}
