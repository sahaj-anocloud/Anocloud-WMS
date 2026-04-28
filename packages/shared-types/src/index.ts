// ─── Common ──────────────────────────────────────────────────────────────────

export type UUID = string;
export type Timestamp = string; // ISO 8601
export type DCId = string;

// ─── Module A: Master Data ────────────────────────────────────────────────────

export type VendorComplianceStatus = 'Active' | 'Suspended' | 'Pending';

export interface Vendor {
  vendor_id: UUID;
  dc_id: DCId;
  vendor_code: string;
  name: string;
  gstin: string;
  compliance_status: VendorComplianceStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type DocumentStatus = 'Active' | 'Expired' | 'Superseded';
export type DocumentType = 'GSTIN' | 'FSSAI' | 'KYC';

export interface VendorDocument {
  doc_id: UUID;
  vendor_id: UUID;
  doc_type: DocumentType;
  file_s3_key: string;
  uploaded_by: UUID;
  uploaded_at: Timestamp;
  expiry_date?: string; // YYYY-MM-DD
  status: DocumentStatus;
  approved_by?: UUID;
  approved_at?: Timestamp;
  version: number;
}

export type SKUCategory = 'FMCG_Food' | 'BDF' | 'Fresh' | 'Chocolate';
export type PackagingClass = 'SealedCarton' | 'GunnyBag' | 'Rice' | 'ShrinkWrap' | 'Loose';
export type SKUStatus = 'Active' | 'Inactive' | 'Incomplete';

export interface SKU {
  sku_id: UUID;
  dc_id: DCId;
  sku_code: string;
  name: string;
  category: SKUCategory;
  packaging_class: PackagingClass;
  is_ft: boolean;
  is_perishable: boolean;
  requires_cold: boolean;
  gst_rate: number;
  mrp: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  weight_g?: number;
  status: SKUStatus;
}

export type BarcodeType = 'EAN13' | 'GS1128' | 'LPN' | 'QR';

export interface Barcode {
  barcode: string;
  sku_id: UUID;
  barcode_type: BarcodeType;
  is_primary: boolean;
  created_at: Timestamp;
}

// ─── Module B: PO / ASN / Appointments ───────────────────────────────────────

export type POStatus = 'Open' | 'InProgress' | 'Closed' | 'PartiallyClosed';

export interface PurchaseOrder {
  po_id: UUID;
  dc_id: DCId;
  sap_po_number: string;
  vendor_id: UUID;
  status: POStatus;
  created_at: Timestamp;
  sap_synced_at?: Timestamp;
}

export type POLineStatus = 'Open' | 'Blocked' | 'Closed';

export interface POLine {
  po_line_id: UUID;
  po_id: UUID;
  sku_id: UUID;
  ordered_qty: number;
  unit_price: number;
  gst_rate: number;
  received_qty: number;
  status: POLineStatus;
}

export type ASNChannel = 'Portal' | 'Email' | 'Paper' | 'BuyerFallback';
export type ASNStatus = 'Submitted' | 'Active' | 'Cancelled' | 'Expired';

export interface ASN {
  asn_id: UUID;
  dc_id: DCId;
  vendor_id: UUID;
  po_id: UUID;
  channel: ASNChannel;
  confidence_score: number; // 0–100
  status: ASNStatus;
  submitted_at: Timestamp;
  is_late: boolean;
}

export type AppointmentStatus =
  | 'Requested'
  | 'Confirmed'
  | 'Cancelled'
  | 'Completed'
  | 'NoShow';

export interface Appointment {
  appointment_id: UUID;
  dc_id: DCId;
  asn_id: UUID;
  vendor_id: UUID;
  dock_door: string;
  slot_start: Timestamp;
  slot_end: Timestamp;
  status: AppointmentStatus;
  is_heavy_truck: boolean;
}

// ─── Module C: Yard and Dock ──────────────────────────────────────────────────

export type YardEntryStatus = 'InYard' | 'AtDock' | 'Unloading' | 'Departed' | 'Holding';

export interface YardEntry {
  entry_id: UUID;
  dc_id: DCId;
  vehicle_reg: string;
  vendor_id: UUID;
  asn_id?: UUID;
  appointment_id?: UUID;
  gate_in_at: Timestamp;
  gate_out_at?: Timestamp;
  dock_assigned_at?: Timestamp;
  unloading_start?: Timestamp;
  unloading_end?: Timestamp;
  status: YardEntryStatus;
}

// ─── Modules D/E: Deliveries, Receiving, GKM, GST ────────────────────────────

export type DeliveryStatus =
  | 'Unloading'
  | 'QCInProgress'
  | 'PendingGRN'
  | 'GRNInProgress'
  | 'GRNComplete'
  | 'Rejected';

export interface Delivery {
  delivery_id: UUID;
  dc_id: DCId;
  asn_id: UUID;
  yard_entry_id: UUID;
  status: DeliveryStatus;
  grpo_doc_number?: string;
  grpo_posted_at?: Timestamp;
  liability_ts?: Timestamp;
  created_at: Timestamp;
}

export type QCStatus = 'Pending' | 'InProgress' | 'Passed' | 'Failed' | 'Blocked';
export type GKMStatus = 'Pending' | 'AutoAccepted' | 'SoftStop' | 'HardStop' | 'Approved';
export type GSTStatus = 'Pending' | 'Matched' | 'Mismatch' | 'Resolved';
export type StagingLane = 'FT' | 'NFT' | 'ColdZone' | 'Unexpected';
export type PromoType = 'Case1' | 'Case2' | 'Case3';

export interface DeliveryLine {
  line_id: UUID;
  delivery_id: UUID;
  po_line_id: UUID;
  sku_id: UUID;
  expected_qty: number;
  received_qty: number;
  packaging_class: PackagingClass;
  required_scans: number;
  completed_scans: number;
  batch_number?: string;
  expiry_date?: string; // YYYY-MM-DD
  qc_status: QCStatus;
  gkm_status: GKMStatus;
  gst_status: GSTStatus;
  staging_lane?: StagingLane;
  promo_type?: PromoType;
}

export type ScanResult = 'Match' | 'Mismatch' | 'Unexpected';

export interface ScanEvent {
  scan_id: UUID;
  delivery_line_id: UUID;
  barcode: string;
  scan_result: ScanResult;
  scanned_by: UUID;
  device_id: string;
  scanned_at: Timestamp;
}

export type GKMTier = 'AutoAccept' | 'SoftStop' | 'HardStop';

export interface GKMCheck {
  check_id: UUID;
  delivery_line_id: UUID;
  po_unit_price: number;
  invoice_unit_price: number;
  variance_pct: number;
  tier: GKMTier;
  approver_id?: UUID;
  approved_at?: Timestamp;
  checked_at: Timestamp;
}

export interface GSTCheck {
  check_id: UUID;
  delivery_line_id: UUID;
  sap_gst_rate: number;
  invoice_gst_rate: number;
  is_mismatch: boolean;
  resolved_by?: UUID;
  resolved_at?: Timestamp;
  resolution_code?: string;
  checked_at: Timestamp;
}

// ─── Module F: LPN ───────────────────────────────────────────────────────────

export type LPNStatus = 'Active' | 'Consumed' | 'Reprinted' | 'Voided';

export interface LPN {
  lpn_id: UUID;
  dc_id: DCId;
  lpn_barcode: string;
  sku_id: UUID;
  delivery_line_id?: UUID;
  batch_number?: string;
  expiry_date?: string; // YYYY-MM-DD
  location?: string;
  status: LPNStatus;
  printed_by: UUID;
  printed_at: Timestamp;
  is_reprinted: boolean;
}

// ─── Module G: Quarantine ─────────────────────────────────────────────────────

export type QuarantineFinancialStatus = 'Held' | 'Released' | 'Rejected' | 'Disposed';
export type QuarantineResolution = 'Accept' | 'Reject' | 'Dispose';

export interface QuarantineRecord {
  quarantine_id: UUID;
  dc_id: DCId;
  sku_id: UUID;
  lpn_id?: UUID;
  quantity: number;
  reason_code: string;
  physical_location?: string;
  financial_status: QuarantineFinancialStatus;
  placed_by: UUID;
  placed_at: Timestamp;
  resolved_by?: UUID;
  resolved_at?: Timestamp;
  resolution?: QuarantineResolution;
}

// ─── Module H: Inventory Ledger ───────────────────────────────────────────────

export type StockState =
  | 'Available'
  | 'Quarantined'
  | 'Held'
  | 'Rejected'
  | 'InTransit'
  | 'Disposed';

export interface InventoryLedger {
  ledger_id: UUID;
  dc_id: DCId;
  sku_id: UUID;
  stock_state: StockState;
  quantity: number;
  updated_at: Timestamp;
}

export type TransactionType = 'Receipt' | 'Quarantine' | 'Release' | 'Dispatch' | 'Disposal';

export interface StockTransaction {
  txn_id: UUID;
  dc_id: DCId;
  sku_id: UUID;
  txn_type: TransactionType;
  from_state?: StockState;
  to_state: StockState;
  quantity: number;
  reference_doc?: string;
  performed_by: UUID;
  performed_at: Timestamp;
}

export type AllocationType = 'FT' | 'NFT';

export interface StoreAllocation {
  allocation_id: UUID;
  dc_id: DCId;
  sku_id: UUID;
  store_id: string;
  delivery_id: UUID;
  allocated_qty: number;
  allocation_type: AllocationType;
  mbq?: number;
  soh?: number;
  demand?: number;
  created_at: Timestamp;
}

// ─── Module I: Alerts ─────────────────────────────────────────────────────────

export type AlertSeverity = 'Info' | 'Warning' | 'Critical';

export interface Alert {
  alert_id: UUID;
  dc_id: DCId;
  alert_type: string;
  severity: AlertSeverity;
  reference_doc?: string;
  triggered_at: Timestamp;
  payload: Record<string, unknown>;
}

export type AlertDeliveryChannel = 'InApp' | 'SMS' | 'Email';
export type AlertDeliveryStatus =
  | 'Pending'
  | 'Sent'
  | 'Acknowledged'
  | 'Escalated'
  | 'Failed';

export interface AlertDelivery {
  delivery_id: UUID;
  alert_id: UUID;
  target_user_id: UUID;
  channel: AlertDeliveryChannel;
  sent_at?: Timestamp;
  acknowledged_at?: Timestamp;
  escalated_at?: Timestamp;
  status: AlertDeliveryStatus;
}

// ─── Module K: Audit ──────────────────────────────────────────────────────────

export interface AuditEvent {
  event_id: UUID;
  dc_id: DCId;
  event_type: string;
  user_id: UUID;
  device_id: string;
  occurred_at: Timestamp;
  reference_doc?: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  reason_code?: string;
}

// ─── ASN Confidence Scoring ───────────────────────────────────────────────────

export interface ASNConfidenceResult {
  score: number;
  is_late: boolean;
}

export const ASN_CHANNEL_RANGES: Record<ASNChannel, { min: number; max: number }> = {
  Portal: { min: 90, max: 100 },
  Email: { min: 70, max: 89 },
  Paper: { min: 40, max: 69 },
  BuyerFallback: { min: 10, max: 39 },
};

// ─── GKM ─────────────────────────────────────────────────────────────────────

export const GKM_THRESHOLDS = {
  AUTO_ACCEPT_MAX_PCT: 0.1,
  SOFT_STOP_MAX_PCT: 0.5,
} as const;

// ─── Scan Count (BR-07) ───────────────────────────────────────────────────────

export interface ScanCountInput {
  packaging_class: PackagingClass;
  batch_size: number;
}
