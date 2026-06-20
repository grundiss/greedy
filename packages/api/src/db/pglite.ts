import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { AppDb } from './index.js';
import * as schema from './schema.js';

export interface PgliteDb {
  db: AppDb;
  // Flushes PGlite to disk and releases the data dir; call on app quit.
  close: () => Promise<void>;
}

// The desktop database: embedded WASM Postgres persisted to `dataDir`.
// Runs the same `drizzle-kit` migrations as the server (idempotent) on startup.
export async function createPgliteDb(dataDir: string, migrationsFolder: string): Promise<PgliteDb> {
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return {
    db,
    close: () => client.close(),
  };
}
