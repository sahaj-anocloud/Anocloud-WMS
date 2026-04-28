import fp from 'fastify-plugin';
import { SQSClient } from '@aws-sdk/client-sqs';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    sqsClient: SQSClient;
  }
}

export default fp(async function sqsPlugin(fastify: FastifyInstance) {
  const sqsClient = new SQSClient({});

  fastify.decorate('sqsClient', sqsClient);

  fastify.addHook('onClose', async () => {
    sqsClient.destroy();
  });
});
