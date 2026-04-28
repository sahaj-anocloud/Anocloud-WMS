import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAuditArchiveJob } from './audit-archive';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn(),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ input }))
  };
});

describe('AuditArchiveJob (Task 12.5)', () => {
  let dbMock: any;
  let s3SendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    s3SendMock = vi.fn().mockResolvedValue({});
    (S3Client as any).mockImplementation(() => ({
      send: s3SendMock,
    }));

    dbMock = {
      query: vi.fn(),
    };
  });

  it('should not upload to S3 or delete from DB if no records are older than 365 days', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    await runAuditArchiveJob(dbMock);

    expect(s3SendMock).not.toHaveBeenCalled();
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });

  it('should upload older records to S3 Glacier Deep Archive and then delete them', async () => {
    const mockEvents = [
      { event_id: 'uuid-1', event_type: 'LOGIN', created_at: '2023-01-01T00:00:00Z' },
      { event_id: 'uuid-2', event_type: 'SCAN', created_at: '2023-01-02T00:00:00Z' },
    ];
    
    // First query returns the events to archive
    dbMock.query.mockResolvedValueOnce({ rows: mockEvents });
    // Second query is the DELETE
    dbMock.query.mockResolvedValueOnce({ rowCount: 2 });

    await runAuditArchiveJob(dbMock);

    // Verify S3 PutObjectCommand was called with DEEP_ARCHIVE
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const putObjCall = s3SendMock.mock.calls[0][0] as PutObjectCommand;
    expect(putObjCall.input?.Bucket).toBe('sumosave-audit-archive-worm');
    expect(putObjCall.input?.StorageClass).toBe('DEEP_ARCHIVE');
    
    // Verify JSONL payload
    const bodyStr = (putObjCall.input?.Body as string) || '';
    const lines = bodyStr.split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).event_id).toBe('uuid-1');

    // Verify DB delete was called with the correct IDs
    expect(dbMock.query).toHaveBeenCalledTimes(2);
    expect(dbMock.query.mock.calls[1][0]).toContain('DELETE FROM audit_events');
    expect(dbMock.query.mock.calls[1][1][0]).toEqual(['uuid-1', 'uuid-2']);
  });
});
