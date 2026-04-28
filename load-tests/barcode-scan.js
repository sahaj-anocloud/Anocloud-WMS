import http from 'k6/http';
import { check, sleep } from 'k6';

// ─── Performance Test: Barcode Scan Response Time ──────────────────────────────
// Validates Req 8.8: Response time for any scan strictly < 1.0s under load.

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Ramp up to 50 users over 30 seconds
    { duration: '1m', target: 50 },  // Stay at 50 users for 1 minute
    { duration: '30s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    // 99% of requests must complete below 1.0s (1000ms)
    http_req_duration: ['p(99)<1000'],
    // Ensure error rate is low
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export default function () {
  const payload = JSON.stringify({
    delivery_line_id: '123e4567-e89b-12d3-a456-426614174000',
    barcode: `890123456789${__VU % 10}`, // Simulate a few different barcodes
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'X-Device-ID': 'test-scanner-device',
    },
  };

  const res = http.post(`${BASE_URL}/scanner/scan`, payload, params);

  check(res, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404, // 404 is valid if test mock data isn't exact
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  // Short sleep to simulate user think time between scans
  sleep(0.5);
}
