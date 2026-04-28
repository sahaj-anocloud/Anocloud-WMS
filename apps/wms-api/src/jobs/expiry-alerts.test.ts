import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { runExpiryAlerts } from './expiry-alerts.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSqsClient(): SQSClient {
  return {
    send: vi.fn().mockResolvedValue({}),
  } as unknown as SQSClient;
}

const QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/123456789/Alert-Events';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runExpiryAlerts', () => {
  describe('expiry warnings (docs expiring within 30 days)', () => {
    it('publishes VENDOR_DOC_EXPIRY_WARNING for each doc expiring within 30 days', async () => {
      const expiringDocs = [
        {
          doc_id: 'doc-1',
          vendor_id: 'vendor-1',
          doc_type: 'GSTIN',
          expiry_date: '2099-01-15',
          dc_id: 'DC01',
        },
        {
          doc_id: 'doc-2',
          vendor_id: 'vendor-2',
          doc_type: 'FSSAI',
          expiry_date: '2099-01-20',
          dc_id: 'DC02',
        },
      ];

      const db = {
        query: vi
          .fn()
          // First call: expiry warning query
          .mockResolvedValueOnce({ rows: expiringDocs, rowCount: 2 } as any as QueryResult)
          // Second call: expired docs query
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      expect(summary.warningsSent).toBe(2);
      expect(summary.vendorsSuspended).toBe(0);
      expect(sqs.send).toHaveBeenCalledTimes(2);

      // Verify message body for first doc
      const firstCall = vi.mocked(sqs.send).mock.calls[0]![0] as any;
      const body = JSON.parse(firstCall.input.MessageBody);
      expect(body.alert_type).toBe('VENDOR_DOC_EXPIRY_WARNING');
      expect(body.vendor_id).toBe('vendor-1');
      expect(body.doc_type).toBe('GSTIN');
      expect(body.expiry_date).toBe('2099-01-15');
      expect(body.dc_id).toBe('DC01');
    });

    it('does not publish warning for docs expiring after 30 days (query filters them out)', async () => {
      // The DB query itself filters to BETWEEN now() AND now()+30 days.
      // If the query returns no rows, no warnings are sent.
      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult) // no expiring-soon docs
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult), // no expired docs
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      expect(summary.warningsSent).toBe(0);
      expect(sqs.send).not.toHaveBeenCalled();
    });

    it('sends correct SQS message body structure', async () => {
      const doc = {
        doc_id: 'doc-abc',
        vendor_id: 'vendor-xyz',
        doc_type: 'KYC',
        expiry_date: '2099-02-28',
        dc_id: 'DC03',
      };

      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [doc], rowCount: 1 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
      } as unknown as Pool;

      const sqs = makeSqsClient();
      await runExpiryAlerts(db, sqs, QUEUE_URL);

      const call = vi.mocked(sqs.send).mock.calls[0]![0] as any;
      const body = JSON.parse(call.input.MessageBody);

      expect(body).toEqual({
        alert_type: 'VENDOR_DOC_EXPIRY_WARNING',
        vendor_id: 'vendor-xyz',
        doc_type: 'KYC',
        expiry_date: '2099-02-28',
        dc_id: 'DC03',
      });
    });
  });

  describe('expired docs handling', () => {
    it('suspends vendor and blocks Open PO lines when a doc is expired', async () => {
      const expiredDoc = {
        doc_id: 'doc-expired',
        vendor_id: 'vendor-suspended',
        doc_type: 'FSSAI',
        expiry_date: '2020-01-01',
        dc_id: 'DC01',
      };

      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult) // no expiring-soon
          .mockResolvedValueOnce({ rows: [expiredDoc], rowCount: 1 } as any as QueryResult) // expired
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult) // UPDATE vendors
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult) // UPDATE po_lines
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult), // UPDATE asns
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      expect(summary.vendorsSuspended).toBe(1);
      expect(summary.warningsSent).toBe(0);

      // Verify vendor suspension query was called
      const calls = vi.mocked(db.query).mock.calls;
      const suspendCall = calls.find(
        (c) =>
          typeof c[0] === 'string' &&
          c[0].includes("compliance_status = 'Suspended'") &&
          c[1]?.[0] === 'vendor-suspended',
      );
      expect(suspendCall).toBeDefined();

      // Verify PO lines blocking query was called
      const blockPoCall = calls.find(
        (c) =>
          typeof c[0] === 'string' &&
          c[0].includes("status = 'Blocked'") &&
          c[1]?.[0] === 'vendor-suspended',
      );
      expect(blockPoCall).toBeDefined();
    });

    it('cancels Submitted and Active ASNs for the suspended vendor', async () => {
      const expiredDoc = {
        doc_id: 'doc-exp',
        vendor_id: 'vendor-asn',
        doc_type: 'GSTIN',
        expiry_date: '2020-06-01',
        dc_id: 'DC01',
      };

      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [expiredDoc], rowCount: 1 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult) // suspend vendor
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult) // block po_lines
          .mockResolvedValueOnce({ rows: [], rowCount: 2 } as any as QueryResult), // cancel asns
      } as unknown as Pool;

      const sqs = makeSqsClient();
      await runExpiryAlerts(db, sqs, QUEUE_URL);

      const calls = vi.mocked(db.query).mock.calls;
      const cancelAsnCall = calls.find(
        (c) =>
          typeof c[0] === 'string' &&
          c[0].includes("status = 'Cancelled'") &&
          c[0].includes('asns') &&
          c[1]?.[0] === 'vendor-asn',
      );
      expect(cancelAsnCall).toBeDefined();
    });

    it('deduplicates vendors — suspends each vendor only once even with multiple expired docs', async () => {
      const expiredDocs = [
        {
          doc_id: 'doc-1',
          vendor_id: 'vendor-multi',
          doc_type: 'GSTIN',
          expiry_date: '2020-01-01',
          dc_id: 'DC01',
        },
        {
          doc_id: 'doc-2',
          vendor_id: 'vendor-multi',
          doc_type: 'FSSAI',
          expiry_date: '2020-02-01',
          dc_id: 'DC01',
        },
      ];

      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: expiredDocs, rowCount: 2 } as any as QueryResult)
          // One set of 3 update queries for the single unique vendor
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      // Only 1 vendor suspended despite 2 expired docs
      expect(summary.vendorsSuspended).toBe(1);
    });
  });

  describe('docs that should not be processed', () => {
    it('does not process already-Superseded or Expired docs (query filters by status = Active)', async () => {
      // The SQL query has WHERE vd.status = 'Active', so Superseded/Expired docs
      // are never returned. We verify the query is called with the correct filter
      // by checking that when the DB returns empty rows, nothing is processed.
      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      expect(summary.warningsSent).toBe(0);
      expect(summary.vendorsSuspended).toBe(0);
      expect(sqs.send).not.toHaveBeenCalled();

      // Verify both queries include status = 'Active' filter
      const calls = vi.mocked(db.query).mock.calls;
      expect(calls[0]![0]).toContain("status = 'Active'");
      expect(calls[1]![0]).toContain("status = 'Active'");
    });

    it('returns zero summary when no documents match either query', async () => {
      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult),
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      expect(summary).toEqual({ warningsSent: 0, vendorsSuspended: 0 });
    });
  });

  describe('combined scenarios', () => {
    it('handles both warnings and suspensions in the same run', async () => {
      const expiringDoc = {
        doc_id: 'doc-warn',
        vendor_id: 'vendor-warn',
        doc_type: 'KYC',
        expiry_date: '2099-01-10',
        dc_id: 'DC01',
      };
      const expiredDoc = {
        doc_id: 'doc-exp',
        vendor_id: 'vendor-exp',
        doc_type: 'GSTIN',
        expiry_date: '2020-01-01',
        dc_id: 'DC02',
      };

      const db = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [expiringDoc], rowCount: 1 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [expiredDoc], rowCount: 1 } as any as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any as QueryResult) // suspend
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult) // block po_lines
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any as QueryResult), // cancel asns
      } as unknown as Pool;

      const sqs = makeSqsClient();
      const summary = await runExpiryAlerts(db, sqs, QUEUE_URL);

      expect(summary.warningsSent).toBe(1);
      expect(summary.vendorsSuspended).toBe(1);
      expect(sqs.send).toHaveBeenCalledTimes(1);
    });
  });
});
