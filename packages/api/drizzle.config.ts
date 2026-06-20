import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'node:path';

loadEnv({ path: resolve(import.meta.dirname, '../../.env') });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
