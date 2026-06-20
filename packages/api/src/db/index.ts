import type { PgDatabase } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

// A Drizzle Postgres-dialect database, independent of the underlying driver.
// Dev/server use `postgres-js` (see ./postgres.ts); the desktop build uses
// PGlite (see ./pglite.ts). Both speak the same `pg-core` dialect, so routes
// can be written once against this type. The query-result HKT is left open
// (`any`) so either concrete driver is assignable.
export type AppDb = PgDatabase<any, typeof schema>;
