import fp from 'fastify-plugin';
import { S3Client } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';

// Extend Fastify's type so fastify.s3Client is available in all routes
declare module 'fastify' {
  interface FastifyInstance {
    s3Client: S3Client;
  }
}

/**
 * Registers an AWS S3Client as fastify.s3Client.
 * Used by the Evidence module (Gap #13) for pre-signed upload/view URLs.
 *
 * Configuration via env vars (same as standard AWS SDK v3):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * In local dev these are set in .env; in production they come from the EC2/ECS role.
 */
export default fp(async function s3Plugin(fastify: FastifyInstance) {
  const s3Client = new S3Client({
    region: process.env['AWS_REGION'] ?? 'ap-south-1',
  });

  fastify.decorate('s3Client', s3Client);

  fastify.addHook('onClose', async () => {
    s3Client.destroy();
  });
});
