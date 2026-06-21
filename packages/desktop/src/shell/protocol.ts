// Serves the active frontend bundle over a custom, privileged `app://` scheme.
// The renderer therefore has a stable, secure origin and never loads code over
// the network — only verified local files from the active content version. The
// web root is resolved through a getter so that after an in-process update the
// SAME handler immediately serves the new version's files.
import { protocol } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { APP_HOST, APP_ORIGIN, APP_SCHEME } from './config.js';
import { log } from './logger.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Strict CSP for the renderer. Scripts/styles come only from the app:// origin
// (no inline scripts); API calls are allowed only to the embedded loopback
// server. `'unsafe-inline'` is permitted for styles because React/Recharts inject
// inline style attributes; no inline <script> is allowed.
const CSP = [
  `default-src 'self' ${APP_ORIGIN}`,
  `script-src 'self' ${APP_ORIGIN}`,
  `style-src 'self' 'unsafe-inline' ${APP_ORIGIN}`,
  `img-src 'self' data: ${APP_ORIGIN}`,
  `font-src 'self' data: ${APP_ORIGIN}`,
  `connect-src 'self' http://127.0.0.1:* http://localhost:*`,
  `object-src 'none'`,
  `base-uri 'none'`,
  `frame-ancestors 'none'`,
].join('; ');

// Must run BEFORE app.whenReady(). Marks app:// as standard + secure so it gets
// a normal origin, the History API (for the SPA router), and fetch/CORS.
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
}

// Resolve a request pathname to a real file inside webRoot, refusing traversal.
function resolveFile(webRoot: string, pathname: string): string | null {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = path.resolve(webRoot, rel);
  // Containment check: the resolved path must stay within webRoot.
  if (target !== webRoot && !target.startsWith(webRoot + path.sep)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  return null;
}

function fileResponse(file: string, extraHeaders?: Record<string, string>): Response {
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': type, 'content-security-policy': CSP, ...extraHeaders },
  });
}

export function installAppProtocol(getWebRoot: () => string | null): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const webRoot = getWebRoot();
    if (!webRoot || !existsSync(webRoot)) {
      log.error('app:// requested but no active web root');
      return notFound();
    }
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return notFound();

    // A real asset → serve it.
    const file = resolveFile(webRoot, url.pathname);
    if (file) return fileResponse(file);

    // Otherwise it's a client-side route (or `/`): serve the SPA shell so the
    // React router can take over. Deep links + reloads work this way.
    const indexPath = path.join(webRoot, 'index.html');
    if (existsSync(indexPath)) return fileResponse(indexPath);
    return notFound();
  });
  log.info('app:// protocol installed');
}
