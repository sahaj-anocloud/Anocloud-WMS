import http from 'k6/http';
import { check, sleep } from 'k6';

// ─── Performance Test: LPN Printing & Sequence Generation ─────────────────────
// Validates concurrency handling for LPN sequence generation under heavy load.

export const options = {
  stages: [
    { duration: '15s', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], 
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export default function () {
  const payload = JSON.stringify({
    dc_code: 'DC001',
    sku_id: '123e4567-e89b-12d3-a456-426614174011',
    batch_number: 'BATCH-K6',
    expiry_date: '2026-12-31',
    printer_host: '192.168.1.100', // Mock thermal printer
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'X-Device-ID': 'test-scanner-device',
    },
  };

  const res = http.post(`${BASE_URL}/scanner/lpn/print`, payload, params);

  check(res, {
    'status is 201': (r) => r.status === 201,
  });

  sleep(0.5);
}
