// The backend entry that ships INSIDE a content bundle (bundled to
// server/index.mjs by scripts/build-content.mjs). The shell loads it dynamically
// from the active, verified bundle and calls start() — this is how a content
// update can change backend behaviour without a new shell.
//
// Contract (must stay stable across bundles, or bump BundleMeta.schemaVersion +
// minShellVersion): the shell injects the database it owns and chooses the port;
// this returns the bound loopback URL and a close handle.
//
// Note: the DB DRIVER (PGlite) and the migration RUNNER live in the shell. This
// entry only builds the Fastify app around the injected db — so it bundles
// fastify/drizzle-orm/routes but NOT pglite or electron.
import { buildApp, type BuildAppOptions } from '@greedy/api/app';
import type { AddressInfo } from 'node:net';

export interface StartOptions {
  db: BuildAppOptions['db'];
  host: string;
  port: number;
  // The renderer's origin (app://greedy.app), which CORS is restricted to.
  corsOrigin: string;
  logger?: boolean;
}

export interface StartedServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function start(opts: StartOptions): Promise<StartedServer> {
  const app = await buildApp({
    db: opts.db,
    enableCors: true,
    corsOrigin: opts.corsOrigin,
    logger: opts.logger ?? false,
  });

  await app.listen({ host: opts.host, port: opts.port });
  const address = app.server.address() as AddressInfo;
  const connectHost = opts.host === '0.0.0.0' || opts.host === '::' ? '127.0.0.1' : opts.host;

  return {
    url: `http://${connectHost}:${address.port}`,
    port: address.port,
    close: () => app.close(),
  };
}
