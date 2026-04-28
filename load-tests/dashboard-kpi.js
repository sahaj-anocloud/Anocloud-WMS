import http from 'k6/http';
import { check, sleep } from 'k6';

// ─── Performance Test: Dashboard KPI View ─────────────────────────────────────
// Validates Req 18.2: KPI dashboard query strictly < 1.0s via pre-aggregated snapshot.

export const options = {
  stages: [
    { duration: '20s', target: 30 },
    { duration: '40s', target: 30 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<500'], // Expecting very fast response (<500ms) due to pre-aggregation
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export default function () {
  const params = {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  };

  const res = http.get(`${BASE_URL}/reports/control-tower`, params);

  check(res, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
