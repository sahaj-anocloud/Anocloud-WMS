import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import healthRoutes from './health.js';

// Stub out infrastructure plugins so we can test routes in isolation
vi.mock('../plugins/db.js', () => ({
  default: async (fastify: any) => {
    fastify.decorate('db', {});
    fastify.decorate('dbRead', {});
  },
}));
vi.mock('../plugins/redis.js', () => ({
  default: async (fastify: any) => {
    fastify.decorate('redis', {});
  },
}));
vi.mock('../plugins/auth.js', () => ({
  default: async () => {},
}));
vi.mock('../plugins/audit.js', () => ({
  default: async () => {},
}));

describe('GET /health', () => {
  it('returns status ok with a timestamp', async () => {
    const app = Fastify();
    await app.register(healthRoutes);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; timestamp: string }>();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});
