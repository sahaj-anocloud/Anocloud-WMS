// ─── E-Way Bill / GST Validation via GSP ─────────────────────────────────────
// Validates inbound E-Way Bills at gate entry using GSP REST wrapper.
// Req 6.1, 6.2

export interface EWayBillDetails {
  ewbNo: string;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  validUpto: string; // ISO date string
  vehicleNo: string;
  supplierGstin: string;
  recipientGstin: string;
  docNo: string;
  docDate: string;
  isValid: boolean;
  invalidReason?: string | undefined;
}

export class EWayBillService {
  private readonly baseUrl: string;
  private readonly timeoutMs = 5000;

  constructor(baseUrl: string = process.env['GSP_BASE_URL'] ?? 'https://gsp.adaequare.com') {
    this.baseUrl = baseUrl;
  }

  /**
   * Validates an E-Way Bill number via the GSP REST API.
   * Flags invalid or expired E-Way Bills.
   * Req 6.1, 6.2
   */
  async validateEWayBill(ewbNo: string): Promise<EWayBillDetails> {
    const url = `${this.baseUrl}/ewb/v1.03/ewbDtls?ewbNo=${encodeURIComponent(ewbNo)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let rawData: Record<string, unknown>;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'gstin': process.env['WMS_GSTIN'] ?? '',
          'Authorization': `Bearer ${process.env['GSP_AUTH_TOKEN'] ?? ''}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`GSP API returned ${response.status}`);
      }

      rawData = (await response.json()) as Record<string, unknown>;
    } catch (err: unknown) {
      clearTimeout(timer);
      // Return a validation failure object rather than throwing
      return {
        ewbNo,
        status: 'CANCELLED',
        validUpto: '',
        vehicleNo: '',
        supplierGstin: '',
        recipientGstin: '',
        docNo: '',
        docDate: '',
        isValid: false,
        invalidReason: `GSP API unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return this.parseResponse(ewbNo, rawData);
  }

  private parseResponse(ewbNo: string, data: Record<string, unknown>): EWayBillDetails {
    const status = String(data['status'] ?? 'CANCELLED').toUpperCase() as EWayBillDetails['status'];
    const validUpto = String(data['validUpto'] ?? '');

    let isValid = status === 'ACTIVE';
    let invalidReason: string | undefined;

    if (status === 'CANCELLED') {
      isValid = false;
      invalidReason = 'E-Way Bill has been cancelled';
    } else if (status === 'EXPIRED') {
      isValid = false;
      invalidReason = 'E-Way Bill has expired';
    } else if (validUpto && new Date(validUpto) < new Date()) {
      isValid = false;
      invalidReason = `E-Way Bill validity expired on ${validUpto}`;
    }

    return {
      ewbNo,
      status,
      validUpto,
      vehicleNo: String(data['vehicleNo'] ?? ''),
      supplierGstin: String(data['fromGstin'] ?? ''),
      recipientGstin: String(data['toGstin'] ?? ''),
      docNo: String(data['docNo'] ?? ''),
      docDate: String(data['docDate'] ?? ''),
      isValid,
      invalidReason,
    };
  }
}
