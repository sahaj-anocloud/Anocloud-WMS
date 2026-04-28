import http from 'k6/http';
import { check, sleep } from 'k6';

// ─── Performance Test: Auto-GRN Generation ────────────────────────────────────
// Validates Req 11.6: Auto-GRN backend job processing load.

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 10,       // 10 requests per second
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // GRN gen can be slower, but 95% under 3s
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export default function () {
  const payload = JSON.stringify({
    delivery_id: '123e4567-e89b-12d3-a456-426614174000',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  };

  const res = http.post(`${BASE_URL}/grn/generate`, payload, params);

  check(res, {
    'status is 201 or 400 (if already generated)': (r) => r.status === 201 || r.status === 400,
  });
}
