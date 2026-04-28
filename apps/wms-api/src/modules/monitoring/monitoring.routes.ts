import { FastifyInstance } from 'fastify';

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics', async (request, reply) => {
    // In a real app, use prom-client
    const metrics = [
      '# HELP wms_api_request_duration_seconds HTTP request duration',
      '# TYPE wms_api_request_duration_seconds histogram',
      `wms_api_request_duration_seconds_count{method="GET",path="/api/v1/lpns"} 105`,
      '',
      '# HELP wms_active_vehicles Current vehicles at DC docks',
      '# TYPE wms_active_vehicles gauge',
      `wms_active_vehicles{dc_id="DC-001"} 14`,
      '',
      '# HELP wms_quarantine_items_total Total items in quarantine',
      '# TYPE wms_quarantine_items_total counter',
      `wms_quarantine_items_total{dc_id="DC-001"} 452`,
    ].join('\n');

    return reply.type('text/plain').send(metrics);
  });

  fastify.get('/health', async () => {
    return { status: 'UP', timestamp: new Date().toISOString() };
  });
}
