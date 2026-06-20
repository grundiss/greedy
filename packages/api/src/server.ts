import type { AddressInfo } from 'node:net';
import { buildApp, type BuildAppOptions } from './app.js';

export interface StartServerOptions extends BuildAppOptions {
  host?: string;
  // Port to bind. Use 0 to let the OS pick a free port (desktop); the actually
  // bound port is returned.
  port?: number;
}

export interface RunningServer {
  app: Awaited<ReturnType<typeof buildApp>>;
  url: string;
  port: number;
}

// Builds and starts the Fastify server, resolving the real bound port (needed
// when `port: 0`). Does not call process.exit — the caller owns lifecycle.
export async function startServer(opts: StartServerOptions): Promise<RunningServer> {
  const app = await buildApp(opts);
  const host = opts.host ?? '127.0.0.1';
  await app.listen({ host, port: opts.port ?? 0 });

  const address = app.server.address() as AddressInfo;
  const port = address.port;
  // 0.0.0.0 isn't a connectable host; use loopback for the returned URL.
  const connectHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const url = `http://${connectHost}:${port}`;

  return { app, url, port };
}
