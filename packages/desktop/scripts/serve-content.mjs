// Tiny static server for content-dist/, to test the update + rollback flow
// locally without publishing anything. Serves manifest.json + the archive with
// the right content types and CORS so the running app can fetch them.
//
//   node scripts/serve-content.mjs                 # http://localhost:8787
//   PORT=9000 node scripts/serve-content.mjs
//
// Then launch the app pointed at it:
//   GREEDY_UPDATE_URL=http://localhost:8787/manifest.json yarn workspace @greedy/desktop start
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(pkgDir, 'content-dist');
const port = Number(process.env.PORT ?? 8787);

const TYPES = {
  '.json': 'application/json',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
  const file = path.resolve(root, rel || 'manifest.json');
  res.setHeader('access-control-allow-origin', '*');
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    console.log(`404 ${req.url}`);
    res.writeHead(404).end('not found');
    return;
  }
  console.log(`200 ${req.url}`);
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

if (!existsSync(root)) {
  console.error(`No ${root} — run build-content.mjs + pack-content.mjs first.`);
  process.exit(1);
}
server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
  console.log(`Point the app at it:  GREEDY_UPDATE_URL=http://localhost:${port}/manifest.json`);
});
