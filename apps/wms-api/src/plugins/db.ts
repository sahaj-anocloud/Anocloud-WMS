import fp from 'fastify-plugin';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    dbRead: Pool;
  }
}

export default fp(async function dbPlugin(fastify: FastifyInstance) {
  const writePool = new Pool({ connectionString: process.env['DB_WRITE_URL'] });
  const readPool = new Pool({ connectionString: process.env['DB_READ_URL'] });

  fastify.decorate('db', writePool);
  fastify.decorate('dbRead', readPool);

  fastify.addHook('onClose', async () => {
    await writePool.end();
    await readPool.end();
  });
});
