'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type PackagingClass =
  | 'SealedCarton'
  | 'GunnyBag'
  | 'Rice'
  | 'ShrinkWrap'
  | 'Loose'
  | 'MixedLoad';

interface PackagingClassConfig {
  base_formula: string;
  physical_count_required: boolean;
  label_affixing_required: boolean;
  packaging_integrity_preserve: boolean;
}

interface ScanPolicyConfig {
  packaging_classes: Record<PackagingClass, PackagingClassConfig>;
  low_confidence_threshold: number;
  low_confidence_multiplier: number;
}

const PACKAGING_CLASSES: PackagingClass[] = [
  'SealedCarton',
  'GunnyBag',
  'Rice',
  'ShrinkWrap',
  'Loose',
  'MixedLoad',
];

const CLASS_LABELS: Record<PackagingClass, string> = {
  SealedCarton: 'Sealed Carton',
  GunnyBag: 'Gunny Bag',
  Rice: 'Rice',
  ShrinkWrap: 'Shrink Wrap',
  Loose: 'Loose',
  MixedLoad: 'Mixed Load',
};

const DEFAULT_POLICY: ScanPolicyConfig = {
  packaging_classes: {
    SealedCarton: {
      base_formula: 'MAX(1, CEIL(batch_size * 0.05))',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
    GunnyBag: {
      base_formula: '1',
      physical_count_required: true,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
    Rice: {
      base_formula: '1',
      physical_count_required: false,
      label_affixing_required: true,
      packaging_integrity_preserve: false,
    },
    ShrinkWrap: {
      base_formula: 'batch_size',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: true,
    },
    Loose: {
      base_formula: 'batch_size + 1',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
    MixedLoad: {
      base_formula: 'MAX(1, CEIL(batch_size * 0.05))',
      physical_count_required: false,
      label_affixing_required: false,
      packaging_integrity_preserve: false,
    },
  },
  low_confidence_threshold: 60,
  low_confidence_multiplier: 1.5,
};

// ─── Boolean Badge ────────────────────────────────────────────────────────────

function BoolBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
        value
          ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/25'
          : 'bg-white/[0.04] text-white/30 border-white/[0.08]'
      }`}
      aria-label={`${label}: ${value ? 'Yes' : 'No'}`}
    >
      {value ? '✓' : '–'} {label}
    </span>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-white/[0.06] rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScanPolicyPage() {
  const [policy, setPolicy] = useState<ScanPolicyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [lowConfidenceThreshold, setLowConfidenceThreshold] = useState<string>('60');
  const [lowConfidenceMultiplier, setLowConfidenceMultiplier] = useState<string>('1.5');
  const [reasonCode, setReasonCode] = useState('');

  // Notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ─── Fetch policy on mount ──────────────────────────────────────────────────

  const fetchPolicy = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.get<{ data: ScanPolicyConfig }>('/api/v1/admin/scan-policy');
      const loaded = res.data ?? DEFAULT_POLICY;
      setPolicy(loaded);
      setLowConfidenceThreshold(String(loaded.low_confidence_threshold));
      setLowConfidenceMultiplier(String(loaded.low_confidence_multiplier));
    } catch {
      // Fall back to default so the page is still usable
      setPolicy(DEFAULT_POLICY);
      setLowConfidenceThreshold(String(DEFAULT_POLICY.low_confidence_threshold));
      setLowConfidenceMultiplier(String(DEFAULT_POLICY.low_confidence_multiplier));
      setErrorMsg('Could not load policy from server — showing defaults.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  // ─── Save handler ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSuccessMsg(null);
    setErrorMsg(null);

    // Validate reason code
    if (!reasonCode.trim()) {
      setErrorMsg('A reason code is required before saving.');
      return;
    }

    // Validate low_confidence_multiplier range [0.5, 5.0]
    const multiplierNum = parseFloat(lowConfidenceMultiplier);
    if (isNaN(multiplierNum) || multiplierNum < 0.5 || multiplierNum > 5.0) {
      setErrorMsg('INVALID_MODIFIER_RANGE — Low confidence multiplier must be between 0.5 and 5.0.');
      return;
    }

    // Validate threshold range [0, 100]
    const thresholdNum = parseInt(lowConfidenceThreshold, 10);
    if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
      setErrorMsg('Low confidence threshold must be between 0 and 100.');
      return;
    }

    if (!policy) return;

    const payload = {
      ...policy,
      low_confidence_threshold: thresholdNum,
      low_confidence_multiplier: multiplierNum,
      reason_code: reasonCode.trim(),
    };

    try {
      setSaving(true);
      const res = await api.put<{ data: ScanPolicyConfig }>('/api/v1/admin/scan-policy', payload);
      const saved = res.data ?? payload;
      setPolicy(saved);
      setLowConfidenceThreshold(String(saved.low_confidence_threshold));
      setLowConfidenceMultiplier(String(saved.low_confidence_multiplier));
      setReasonCode('');
      setSuccessMsg('Scan policy saved successfully.');
    } catch (err: unknown) {
      const apiErr = err as { body?: { error?: string; message?: string } };
      const code = apiErr?.body?.error;
      if (code === 'INVALID_MODIFIER_RANGE') {
        setErrorMsg('INVALID_MODIFIER_RANGE — The modifier value is outside the allowed range [0.5, 5.0].');
      } else {
        setErrorMsg(apiErr?.body?.message ?? 'Failed to save scan policy. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-5 animate-fade-in max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Scan Policy Configuration</h1>
          <p className="text-xs text-white/40 mt-0.5">Configure risk-based scanning rules per packaging class</p>
        </div>
        <button onClick={fetchPolicy} className="btn-ghost text-xs" aria-label="Refresh scan policy">
          ↻ REFRESH
        </button>
      </div>

      {/* Success / Error banners */}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 p-3 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/25 text-[#00ff88] text-xs font-medium"
        >
          <span>✓</span>
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="ml-auto text-[#00ff88]/60 hover:text-[#00ff88] transition-colors"
            aria-label="Dismiss success message"
          >
            ✕
          </button>
        </div>
      )}
      {errorMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-medium"
        >
          <span>⚠</span>
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-red-400/60 hover:text-red-400 transition-colors"
            aria-label="Dismiss error message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Packaging class table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white/80">Packaging Class Rules</h2>
          <p className="text-[10px] text-white/30 mt-0.5">Read-only display of base formulas and workflow flags per packaging class</p>
        </div>
        <div className="overflow-x-auto">
          <table className="wms-table">
            <thead>
              <tr>
                <th scope="col">Packaging Class</th>
                <th scope="col">Base Formula</th>
                <th scope="col">Physical Count</th>
                <th scope="col">Label Affixing</th>
                <th scope="col">Integrity Preserve</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : PACKAGING_CLASSES.map((cls) => {
                    const cfg = policy?.packaging_classes[cls];
                    return (
                      <tr key={cls}>
                        <td>
                          <span className="font-semibold text-white/80 text-xs">{CLASS_LABELS[cls]}</span>
                          <span className="block font-mono text-[9px] text-white/25 mt-0.5">{cls}</span>
                        </td>
                        <td>
                          <code className="text-[10px] font-mono text-[#00ff88]/70 bg-[#00ff88]/5 px-2 py-0.5 rounded">
                            {cfg?.base_formula ?? '—'}
                          </code>
                        </td>
                        <td>
                          <BoolBadge value={cfg?.physical_count_required ?? false} label="Required" />
                        </td>
                        <td>
                          <BoolBadge value={cfg?.label_affixing_required ?? false} label="Required" />
                        </td>
                        <td>
                          <BoolBadge value={cfg?.packaging_integrity_preserve ?? false} label="Preserve" />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editable policy settings */}
      <div className="card p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-white/80">Low-Confidence ASN Settings</h2>
          <p className="text-[10px] text-white/30 mt-0.5">
            Applied when a vendor's ASN confidence score falls below the threshold
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Low confidence threshold */}
          <div className="space-y-1.5">
            <label
              htmlFor="low-confidence-threshold"
              className="block text-xs font-medium text-white/60"
            >
              Low Confidence Threshold
              <span className="ml-1 text-white/25 font-normal">(0 – 100)</span>
            </label>
            <input
              id="low-confidence-threshold"
              type="number"
              min={0}
              max={100}
              step={1}
              value={lowConfidenceThreshold}
              onChange={(e) => setLowConfidenceThreshold(e.target.value)}
              className="input-field text-xs w-full"
              aria-describedby="threshold-hint"
              disabled={loading}
            />
            <p id="threshold-hint" className="text-[10px] text-white/25">
              ASN confidence scores below this value trigger the low-confidence multiplier.
            </p>
          </div>

          {/* Low confidence multiplier */}
          <div className="space-y-1.5">
            <label
              htmlFor="low-confidence-multiplier"
              className="block text-xs font-medium text-white/60"
            >
              Low Confidence Multiplier
              <span className="ml-1 text-white/25 font-normal">(0.5 – 5.0)</span>
            </label>
            <input
              id="low-confidence-multiplier"
              type="number"
              min={0.5}
              max={5.0}
              step={0.1}
              value={lowConfidenceMultiplier}
              onChange={(e) => setLowConfidenceMultiplier(e.target.value)}
              className="input-field text-xs w-full"
              aria-describedby="multiplier-hint"
              disabled={loading}
            />
            <p id="multiplier-hint" className="text-[10px] text-white/25">
              Multiplier applied to required scans for low-confidence deliveries. Must be in [0.5, 5.0].
            </p>
          </div>
        </div>

        {/* Reason code */}
        <div className="space-y-1.5">
          <label
            htmlFor="reason-code"
            className="block text-xs font-medium text-white/60"
          >
            Reason Code
            <span className="ml-1 text-red-400/70 font-normal">* required</span>
          </label>
          <input
            id="reason-code"
            type="text"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="e.g. Q4 policy review, compliance audit adjustment…"
            className="input-field text-xs w-full"
            aria-required="true"
            aria-describedby="reason-hint"
            disabled={loading}
          />
          <p id="reason-hint" className="text-[10px] text-white/25">
            A non-empty reason code is required. It will be recorded in the audit trail.
          </p>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary text-xs px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-busy={saving}
          >
            {saving ? 'Saving…' : 'Save Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}
