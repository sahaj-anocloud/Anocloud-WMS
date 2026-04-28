import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  encodeGS1128,
  decodeGS1128,
  toGS1ExpiryDate,
  fromGS1ExpiryDate,
  buildLPNBarcode,
  formatSequence,
  todayYYYYMMDD,
  type GS1128Fields,
} from './lpn.service.js';

// ─── GS1-128 Unit Tests ───────────────────────────────────────────────────────

describe('GS1-128 Encoding', () => {
  it('encodes GTIN-14 with AI (01)', () => {
    const encoded = encodeGS1128({ gtin: '01234567890123' });
    expect(encoded).toBe('(01)01234567890123');
  });

  it('encodes batch with AI (10)', () => {
    const encoded = encodeGS1128({ batch: 'BATCH001' });
    expect(encoded).toBe('(10)BATCH001');
  });

  it('encodes expiry with AI (17)', () => {
    const encoded = encodeGS1128({ expiry: '260422' });
    expect(encoded).toBe('(17)260422');
  });

  it('encodes SSCC-18 with AI (00)', () => {
    const encoded = encodeGS1128({ sscc: '123456789012345678' });
    expect(encoded).toBe('(00)123456789012345678');
  });

  it('encodes combined GTIN + expiry + batch', () => {
    const encoded = encodeGS1128({
      gtin: '01234567890123',
      expiry: '260422',
      batch: 'LOT42',
    });
    expect(encoded).toBe('(01)01234567890123(17)260422(10)LOT42');
  });

  it('pads GTIN to 14 digits', () => {
    const encoded = encodeGS1128({ gtin: '123' });
    expect(encoded).toBe('(01)00000000000123');
  });

  it('pads SSCC to 18 digits', () => {
    const encoded = encodeGS1128({ sscc: '999' });
    expect(encoded).toBe('(00)000000000000000999');
  });
});

// ─── GS1-128 Decode Unit Tests ────────────────────────────────────────────────

describe('GS1-128 Decoding', () => {
  it('decodes GTIN-14', () => {
    const decoded = decodeGS1128('(01)01234567890123');
    expect(decoded.gtin).toBe('01234567890123');
  });

  it('decodes batch', () => {
    const decoded = decodeGS1128('(10)BATCH001');
    expect(decoded.batch).toBe('BATCH001');
  });

  it('decodes expiry', () => {
    const decoded = decodeGS1128('(17)260422');
    expect(decoded.expiry).toBe('260422');
  });

  it('decodes combined string', () => {
    const decoded = decodeGS1128('(01)01234567890123(17)260422(10)LOT42');
    expect(decoded.gtin).toBe('01234567890123');
    expect(decoded.expiry).toBe('260422');
    expect(decoded.batch).toBe('LOT42');
  });

  it('handles empty string gracefully', () => {
    const decoded = decodeGS1128('');
    expect(decoded).toEqual({});
  });
});

// ─── Expiry Date Conversion ───────────────────────────────────────────────────

describe('Expiry date conversion', () => {
  it('converts ISO date to GS1 YYMMDD', () => {
    expect(toGS1ExpiryDate('2026-04-22')).toBe('260422');
  });

  it('converts GS1 YYMMDD back to ISO', () => {
    expect(fromGS1ExpiryDate('260422')).toBe('2026-04-22');
  });

  it('round-trips ISO → GS1 → ISO', () => {
    const iso = '2027-12-31';
    expect(fromGS1ExpiryDate(toGS1ExpiryDate(iso))).toBe(iso);
  });
});

// ─── LPN Barcode Format Unit Tests ────────────────────────────────────────────

describe('LPN barcode format', () => {
  it('formats sequence as 8-digit zero-padded', () => {
    expect(formatSequence(1)).toBe('00000001');
    expect(formatSequence(12345678)).toBe('12345678');
    expect(formatSequence(99999999)).toBe('99999999');
  });

  it('builds LPN barcode in correct format', () => {
    const barcode = buildLPNBarcode('DC001', '20260422', 1);
    expect(barcode).toBe('DC001-20260422-00000001');
  });

  it('includes DC code, date, and sequence', () => {
    const barcode = buildLPNBarcode('MUM001', '20271231', 42);
    expect(barcode).toBe('MUM001-20271231-00000042');
  });

  it('todayYYYYMMDD returns 8-digit date string', () => {
    const today = todayYYYYMMDD();
    expect(today).toMatch(/^\d{8}$/);
    expect(today.length).toBe(8);
  });
});

// ─── Property 21: LPN Uniqueness ──────────────────────────────────────────────
// Use fast-check to generate random sequences of LPN generation requests
// within a DC. Assert: no two generated LPNs share the same barcode.
// Validates: Requirements 13.1, 13.3, 13.5

describe('Property 21: LPN Uniqueness', () => {
  it('no two LPNs share the same barcode for distinct sequences', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dcCode: fc.constantFrom('DC001', 'DC002', 'MUM001'),
            seq: fc.integer({ min: 1, max: 99999999 }),
          }),
          { minLength: 2, maxLength: 50 },
        ),
        (requests) => {
          const datePart = '20260422';
          const barcodes = requests.map((r) => buildLPNBarcode(r.dcCode, datePart, r.seq));

          // LPNs with duplicate (dcCode, seq, date) should produce the same barcode
          // — the uniqueness invariant is: distinct (dcCode, date, seq) → distinct barcode
          const seenByKey = new Map<string, string>();
          for (const req of requests) {
            const key = `${req.dcCode}-${datePart}-${req.seq}`;
            const barcode = buildLPNBarcode(req.dcCode, datePart, req.seq);
            const existing = seenByKey.get(key);
            if (existing !== undefined) {
              // Same input → same deterministic output (idempotent)
              expect(existing).toBe(barcode);
            } else {
              seenByKey.set(key, barcode);
            }
          }

          // All values in the map should be unique (distinct keys → distinct barcodes)
          const allBarcodes = [...seenByKey.values()];
          const uniqueBarcodes = new Set(allBarcodes);
          expect(uniqueBarcodes.size).toBe(allBarcodes.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('barcodes from different DC codes never collide even with same sequence', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99999999 }),
        fc.constantFrom('DC001', 'DC002', 'MUM001', 'DEL001'),
        fc.constantFrom('DC001', 'DC002', 'MUM001', 'DEL001'),
        (seq, dcA, dcB) => {
          fc.pre(dcA !== dcB);
          const date = '20260422';
          const barcodeA = buildLPNBarcode(dcA, date, seq);
          const barcodeB = buildLPNBarcode(dcB, date, seq);
          expect(barcodeA).not.toBe(barcodeB);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 22: LPN Encode/Decode Round-Trip ────────────────────────────────
// Use fast-check to generate random LPN data, encode to GS1-128, decode back,
// assert all fields are identical to the original input.
// Validates: Requirements 13.3, 13.4

describe('Property 22: LPN Encode/Decode Round-Trip', () => {
  it('GS1-128 encode → decode is lossless for all field combinations', () => {
    fc.assert(
      fc.property(
        fc.record({
          gtin: fc.option(
            fc.stringMatching(/^\d{1,14}$/).map((s) => s.padStart(14, '0')),
            { nil: undefined },
          ),
          batch: fc.option(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/[()]/.test(s)),
            { nil: undefined },
          ),
          expiry: fc.option(
            fc.record({
              yy: fc.integer({ min: 24, max: 35 }).map((n) => String(n).padStart(2, '0')),
              mm: fc.integer({ min: 1, max: 12 }).map((n) => String(n).padStart(2, '0')),
              dd: fc.integer({ min: 1, max: 28 }).map((n) => String(n).padStart(2, '0')),
            }).map(({ yy, mm, dd }) => `${yy}${mm}${dd}`),
            { nil: undefined },
          ),
        }),
        ({ gtin, batch, expiry }) => {
          // At least one field must be present
          fc.pre(gtin !== undefined || batch !== undefined || expiry !== undefined);

          const fields: GS1128Fields = {};
          if (gtin !== undefined) fields.gtin = gtin;
          if (batch !== undefined) fields.batch = batch;
          if (expiry !== undefined) fields.expiry = expiry;

          const encoded = encodeGS1128(fields);
          const decoded = decodeGS1128(encoded);

          if (gtin !== undefined) expect(decoded.gtin).toBe(gtin);
          if (expiry !== undefined) expect(decoded.expiry).toBe(expiry);
          if (batch !== undefined) expect(decoded.batch).toBe(batch);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expiry date ISO → GS1 → ISO round-trip is lossless', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2024, max: 2035 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 28 }),
        }),
        ({ year, month, day }) => {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const roundTripped = fromGS1ExpiryDate(toGS1ExpiryDate(iso));
          expect(roundTripped).toBe(iso);
        },
      ),
      { numRuns: 100 },
    );
  });
});
