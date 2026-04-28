import type { Pool } from 'pg';
import type { DocumentType, VendorComplianceStatus } from '@sumosave/shared-types';
import { writeAuditEvent } from '../../plugins/audit.js';

const MANDATORY_DOC_TYPES: DocumentType[] = ['GSTIN', 'FSSAI', 'KYC'];
const GSTIN_REGEX = /^[A-Z0-9]{15}$/;

export interface CreateVendorInput {
  vendor_code: string;
  name: string;
  gstin: string;
}

export interface VendorRow {
  vendor_id: string;
  dc_id: string;
  vendor_code: string;
  name: string;
  gstin: string;
  compliance_status: VendorComplianceStatus;
  created_at: string;
  updated_at: string;
  first_approver_id?: string;
  first_approved_at?: string;
  second_approver_id?: string;
  second_approved_at?: string;
}

export interface VendorDocumentRow {
  doc_id: string;
  vendor_id: string;
  doc_type: DocumentType;
  file_s3_key: string;
  uploaded_by: string;
  uploaded_at: string;
  expiry_date: string | null;
  status: string;
  version: number;
}

export interface ComplianceStatusResult {
  vendor_id: string;
  compliance_status: VendorComplianceStatus;
  missing_docs: DocumentType[];
  expired_docs: DocumentType[];
}

export class VendorService {
  constructor(
    private readonly db: Pool,
    private readonly dbRead: Pool,
  ) {}

  async createVendor(dcId: string, data: CreateVendorInput): Promise<VendorRow> {
    if (!GSTIN_REGEX.test(data.gstin)) {
      throw new Error('INVALID_GSTIN: GSTIN must be exactly 15 alphanumeric characters (uppercase)');
    }

    const result = await this.db.query<VendorRow>(
      `INSERT INTO vendors (dc_id, vendor_code, name, gstin, compliance_status)
       VALUES ($1, $2, $3, $4, 'Pending')
       RETURNING *`,
      [dcId, data.vendor_code, data.name, data.gstin],
    );

    return result.rows[0]!;
  }

  async uploadDocument(
    vendorId: string,
    docType: DocumentType,
    s3Key: string,
    uploadedBy: string,
    expiryDate: string | null,
    dcId: string,
    deviceId: string,
  ): Promise<VendorDocumentRow> {
    // Supersede any existing active document of the same type
    await this.db.query(
      `UPDATE vendor_documents
       SET status = 'Superseded'
       WHERE vendor_id = $1 AND doc_type = $2 AND status = 'Active'`,
      [vendorId, docType],
    );

    // Determine next version number
    const versionResult = await this.db.query<{ max: number | null }>(
      `SELECT MAX(version) AS max FROM vendor_documents WHERE vendor_id = $1 AND doc_type = $2`,
      [vendorId, docType],
    );
    const nextVersion = (versionResult.rows[0]?.max ?? 0) + 1;

    const insertResult = await this.db.query<VendorDocumentRow>(
      `INSERT INTO vendor_documents
         (vendor_id, doc_type, file_s3_key, uploaded_by, expiry_date, status, version)
       VALUES ($1, $2, $3, $4, $5, 'Active', $6)
       RETURNING *`,
      [vendorId, docType, s3Key, uploadedBy, expiryDate ?? null, nextVersion],
    );

    const doc = insertResult.rows[0]!;

    await writeAuditEvent(this.db, {
      dc_id: dcId,
      event_type: 'DOCUMENT_UPLOADED',
      user_id: uploadedBy,
      device_id: deviceId,
      reference_doc: doc.doc_id,
      new_state: {
        vendor_id: vendorId,
        doc_type: docType,
        s3_key: s3Key,
        version: nextVersion,
        expiry_date: expiryDate,
      },
    });

    return doc;
  }

  async getComplianceStatus(vendorId: string): Promise<ComplianceStatusResult> {
    const vendorResult = await this.dbRead.query<{ compliance_status: VendorComplianceStatus }>(
      `SELECT compliance_status FROM vendors WHERE vendor_id = $1`,
      [vendorId],
    );

    if (vendorResult.rows.length === 0) {
      throw new Error(`VENDOR_NOT_FOUND: ${vendorId}`);
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const docsResult = await this.dbRead.query<{
      doc_type: DocumentType;
      expiry_date: string | null;
    }>(
      `SELECT doc_type, expiry_date
       FROM vendor_documents
       WHERE vendor_id = $1 AND status = 'Active'`,
      [vendorId],
    );

    const activeDocs = new Map<DocumentType, string | null>();
    for (const row of docsResult.rows) {
      activeDocs.set(row.doc_type, row.expiry_date);
    }

    const missing_docs: DocumentType[] = [];
    const expired_docs: DocumentType[] = [];

    for (const docType of MANDATORY_DOC_TYPES) {
      if (!activeDocs.has(docType)) {
        missing_docs.push(docType);
      } else {
        const expiry = activeDocs.get(docType);
        if (expiry !== null && expiry !== undefined && expiry < today) {
          expired_docs.push(docType);
        }
      }
    }

    return {
      vendor_id: vendorId,
      compliance_status: vendorResult.rows[0]!.compliance_status,
      missing_docs,
      expired_docs,
    };
  }

  async approveVendor(
    vendorId: string,
    approverId: string,
    deviceId: string,
    dcId: string,
  ): Promise<VendorRow> {
    const status = await this.getComplianceStatus(vendorId);

    if (status.missing_docs.length > 0) {
      throw new Error(
        `MISSING_MANDATORY_DOCS: ${status.missing_docs.join(', ')}`,
      );
    }

    if (status.expired_docs.length > 0) {
      throw new Error(
        `EXPIRED_MANDATORY_DOCS: ${status.expired_docs.join(', ')}`,
      );
    }

    const result = await this.db.query<VendorRow>(
      `UPDATE vendors
       SET compliance_status = 'PendingSecondApproval', updated_at = now(),
           first_approver_id = $2, first_approved_at = now()
       WHERE vendor_id = $1
       RETURNING *`,
      [vendorId, approverId],
    );

    const vendor = result.rows[0]!;

    await writeAuditEvent(this.db, {
      dc_id: dcId,
      event_type: 'VENDOR_FIRST_APPROVAL',
      user_id: approverId,
      device_id: deviceId,
      reference_doc: vendorId,
      new_state: {
        vendor_id: vendorId,
        first_approver_id: approverId,
        first_approved_at_ms: Date.now(),
        device_id: deviceId,
        compliance_status: 'PendingSecondApproval',
      },
    });

    return vendor;
  }

  async secondApproveVendor(
    vendorId: string,
    approverId: string,
    deviceId: string,
    dcId: string,
  ): Promise<VendorRow> {
    const fetchResult = await this.dbRead.query(
      `SELECT first_approver_id, compliance_status FROM vendors WHERE vendor_id = $1`,
      [vendorId]
    );

    if (fetchResult.rows.length === 0) {
      throw new Error(`VENDOR_NOT_FOUND: ${vendorId}`);
    }

    const currentVendor = fetchResult.rows[0];

    if (currentVendor.compliance_status !== 'PendingSecondApproval') {
      throw new Error(`VENDOR_NOT_PENDING_SECOND_APPROVAL: ${currentVendor.compliance_status}`);
    }

    if (currentVendor.first_approver_id === approverId) {
      throw new Error('Same user cannot provide second approval');
    }

    const result = await this.db.query<VendorRow>(
      `UPDATE vendors
       SET compliance_status = 'Active', updated_at = now(),
           second_approver_id = $2, second_approved_at = now()
       WHERE vendor_id = $1
       RETURNING *`,
      [vendorId, approverId],
    );

    const vendor = result.rows[0]!;

    await writeAuditEvent(this.db, {
      dc_id: dcId,
      event_type: 'VENDOR_SECOND_APPROVAL',
      user_id: approverId,
      device_id: deviceId,
      reference_doc: vendorId,
      new_state: {
        vendor_id: vendorId,
        second_approver_id: approverId,
        second_approved_at_ms: Date.now(),
        device_id: deviceId,
        compliance_status: 'Active',
      },
    });

    return vendor;
  }

  async listVendors(dcId: string, options: { search?: string; limit?: number; offset?: number } = {}): Promise<{ data: VendorRow[]; total: number }> {
    const { search, limit = 50, offset = 0 } = options;
    const params: unknown[] = [dcId];
    const clauses: string[] = ['dc_id = $1'];
    let idx = 2;

    if (search) {
      clauses.push(`(vendor_code ILIKE $${idx} OR name ILIKE $${idx} OR gstin ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const countResult = await this.dbRead.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM vendors ${where}`,
      params,
    );

    const dataParams = [...params, limit, offset];
    const result = await this.dbRead.query<VendorRow>(
      `SELECT * FROM vendors ${where} ORDER BY vendor_code LIMIT $${idx} OFFSET $${idx + 1}`,
      dataParams,
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0]?.total ?? '0', 10),
    };
  }
}

