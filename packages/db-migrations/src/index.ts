/**
 * SumoSave WMS — Database Migration Runner
 *
 * Uses node-pg-migrate to apply SQL migrations from the `migrations/` directory.
 * Run via: npm run migrate (up) or npm run migrate:down (down)
 *
 * Environment variables:
 *   DATABASE_URL  — PostgreSQL connection string (required)
 *                   e.g. postgres://user:pass@host:5432/sumosave_wms
 */

import { resolve } from 'path';
import runner from 'node-pg-migrate';

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

async function migrate(): Promise<void> {
  const direction = (process.argv[2] as 'up' | 'down') ?? 'up';

  console.log(`Running migrations (${direction}) from: ${MIGRATIONS_DIR}`);

  await runner({
    databaseUrl: DATABASE_URL as string,
    migrationsTable: 'pgmigrations',
    dir: MIGRATIONS_DIR,
    direction,
    // Use the V###__ prefix as the migration file naming convention
    // node-pg-migrate will order by filename alphabetically
    verbose: true,
    // Ensure TimescaleDB extension is available before running migrations
    createSchema: false,
    createMigrationsSchema: false,
  });

  console.log(`Migrations (${direction}) completed successfully.`);
}

migrate().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
