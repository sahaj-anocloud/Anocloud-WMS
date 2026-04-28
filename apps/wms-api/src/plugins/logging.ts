import fp from 'fastify-plugin';
import pino from 'pino';

export default fp(async (fastify) => {
  const logger = pino({
    level: process.env['LOG_LEVEL'] || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
    mixin: () => {
      return { 
        service: 'wms-api',
        env: process.env['NODE_ENV'] || 'development'
      };
    },
  });

  fastify.addHook('onRequest', async (request) => {
    request.log.info({
      msg: 'Incoming Request',
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info({
      msg: 'Request Completed',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    });
  });

  fastify.decorate('logger', logger);
});
