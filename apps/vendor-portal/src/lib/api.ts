/**
 * Centralised API client for the Vendor Portal.
 * All calls go through this module so the base URL is configured in one place.
 * The JWT token is read from sessionStorage (set on login).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('wms_token') ?? '';
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.message ?? `HTTP ${res.status}`), { status: res.status, body });
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:   <T>(path: string) => apiFetch<T>(path),
  post:  <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put:   <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  del:   <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
};

/** Auth helpers — read identity stored at login */
export const auth = {
  getToken: () => typeof window !== 'undefined' ? sessionStorage.getItem('wms_token') ?? '' : '',
  getUserId: () => typeof window !== 'undefined' ? sessionStorage.getItem('wms_user_id') ?? '' : '',
  getVendorId: () => typeof window !== 'undefined' ? sessionStorage.getItem('wms_vendor_id') ?? sessionStorage.getItem('wms_user_id') ?? '' : '',
  getDcId: () => typeof window !== 'undefined' ? sessionStorage.getItem('wms_dc_id') ?? 'DC-BLR-01' : 'DC-BLR-01',
  getRoles: (): string[] => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(sessionStorage.getItem('wms_roles') ?? '[]'); } catch { return []; }
  },
  isLoggedIn: () => typeof window !== 'undefined' && !!sessionStorage.getItem('wms_token'),
  logout: () => {
    if (typeof window === 'undefined') return;
    ['wms_token', 'wms_user_id', 'wms_dc_id', 'wms_roles'].forEach(k => sessionStorage.removeItem(k));
  },
};

// ─── Type Definitions matching backend response shapes ────────────────────────

export interface KPISnapshot {
  asn_coverage_rate: number;
  gate_to_grn_time_avg_min: number | null;
  perishable_dwell_avg_min: number | null;
  receipt_first_pass_yield: number;
  barcode_remediation_rate: number;
  scanning_compliance_rate: number;
  batch_capture_rate: number;
  inventory_accuracy_rate: number;
  vendor_compliance_rate: number;
  total_deliveries: number;
  total_asns: number;
  snapshot_at: string;
  _fallback?: boolean; // true when DB is unavailable
}

export interface YardEntry {
  yard_entry_id: string;
  vendor_name: string;
  asn_id: string;
  vehicle_number: string;
  dock_number: string | null;
  status: string;
  gate_in_at: string;
  elapsed_min: number;
  temperature_class: string;
  confidence_score: number;
}

export interface AlertItem {
  alert_id: string;
  alert_type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  message: string;
  triggered_at: string;
  is_acknowledged: boolean;
  delivery_id?: string;
  vendor_name?: string;
}

export interface ExceptionItem {
  exception_id: string;
  type: string;
  severity: string;
  vendor_name: string;
  delivery_id: string;
  created_at: string;
  status: 'Open' | 'Resolved' | 'Escalated';
  description: string;
}
