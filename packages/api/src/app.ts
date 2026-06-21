import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { HealthResponse } from '@greedy/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppDb } from './db/index.js';
import { videoRoutes } from './routes/videos.js';

// Make the injected database available to every route as `app.db` /
// `request.server.db`, so routes don't depend on a specific driver.
declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
  }
}

export interface BuildAppOptions {
  // The database to serve queries from (Postgres in dev/server, PGlite on desktop).
  db: AppDb;
  // Enable CORS. Needed when web is served from a different origin (dev: Vite on
  // :5173 → API on :3000; desktop: the SPA loads from the app:// origin while the
  // API runs on a loopback HTTP port).
  enableCors?: boolean;
  // Restrict CORS to this origin (or origins). Defaults to reflecting any origin
  // when unset — fine for dev/loopback. The desktop shell passes its app:// origin.
  corsOrigin?: string | string[];
  // Absolute path to the built web SPA (packages/web/dist). When set, Fastify
  // serves it and falls back to index.html for client-side routes.
  serveWebRoot?: string;
  // Fastify logger config; defaults to enabled. Pass `false` to silence.
  logger?: FastifyServerOptions['logger'];
}

// Builds the (unstarted) Fastify instance. Callers decide when/where to listen.
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true });

  app.decorate('db', opts.db);

  if (opts.enableCors) {
    await app.register(cors, { origin: opts.corsOrigin ?? true });
  }

  app.get('/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes are registered before static so they always win over the SPA.
  await app.register(videoRoutes);

  if (opts.serveWebRoot) {
    // `wildcard: false` avoids a greedy `/*` route; SPA deep links are handled
    // by the not-found handler below instead.
    await app.register(fastifyStatic, { root: opts.serveWebRoot, wildcard: false });

    app.setNotFoundHandler((request, reply) => {
      // A browser navigation to a client-side route (e.g. /reports) → serve the
      // SPA shell. A genuine unmatched API call → honest JSON 404.
      const accept = request.headers.accept ?? '';
      if (request.method === 'GET' && accept.includes('text/html')) {
        return reply.sendFile('index.html');
      }
      reply.code(404);
      return reply.send({ error: 'NotFound', message: 'Not found' });
    });
  }

  return app;
}
