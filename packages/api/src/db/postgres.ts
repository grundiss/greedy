import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { AppDb } from './index.js';
import * as schema from './schema.js';

// The dev/server database connection (PostgreSQL via the `postgres` driver).
export function createPostgresDb(databaseUrl: string): AppDb {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}
