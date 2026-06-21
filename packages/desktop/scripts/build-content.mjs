// Assembles a content bundle — the unit a content update ships. Layout:
//
//   content-build/<version>/
//     bundle.json          metadata (version, minShellVersion, paths)
//     web/                 the built SPA (copied from ../web/dist)
//     server/index.mjs     the backend, bundled self-contained (NO pglite/electron)
//     drizzle/             drizzle-kit migrations (copied from ../api/drizzle)
//
// It also refreshes ../desktop/content-seed/ with the same files, which
// electron-builder ships inside the app to bootstrap first launch.
//
// Prereqs: build @greedy/shared, @greedy/api, and @greedy/web first (the root
// `yarn build:desktop` / `yarn content:build` scripts chain these).
//
//   node scripts/build-content.mjs              # version from package.json
//   CONTENT_VERSION=1.0.3 node scripts/build-content.mjs   # override (test updates)
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

const version = process.env.CONTENT_VERSION ?? pkg.version;
const minShellVersion = process.env.MIN_SHELL_VERSION ?? pkg.version;

const webDist = path.join(repoRoot, 'packages', 'web', 'dist');
const drizzleDir = path.join(repoRoot, 'packages', 'api', 'drizzle');
for (const [label, p] of [
  ['web build', webDist],
  ['api migrations', drizzleDir],
]) {
  if (!existsSync(p)) {
    console.error(`Missing ${label} at ${p}. Build shared/api/web first.`);
    process.exit(1);
  }
}

const outDir = path.join(pkgDir, 'content-build', version);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, 'server'), { recursive: true });

console.log(`Building content bundle ${version} (minShellVersion ${minShellVersion})`);

// 1) Frontend
cpSync(webDist, path.join(outDir, 'web'), { recursive: true });

// 2) Backend — self-contained ESM. The db driver (pglite) is injected by the
// shell, so it is NOT bundled here; electron is never referenced.
await build({
  entryPoints: [path.join(pkgDir, 'src', 'content', 'server-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.join(outDir, 'server', 'index.mjs'),
  banner: {
    js: [
      "import { createRequire as __cjsCreateRequire } from 'node:module';",
      'const require = __cjsCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});

// 3) Migrations
cpSync(drizzleDir, path.join(outDir, 'drizzle'), { recursive: true });

// 4) Metadata
const meta = {
  schemaVersion: 1,
  version,
  minShellVersion,
  createdAt: new Date().toISOString(),
  paths: { web: 'web', server: 'server/index.mjs', migrations: 'drizzle' },
};
writeFileSync(path.join(outDir, 'bundle.json'), JSON.stringify(meta, null, 2));

// 5) Refresh the shipped seed (used for first-launch bootstrap + dev).
const seedDir = path.join(pkgDir, 'content-seed');
rmSync(seedDir, { recursive: true, force: true });
cpSync(outDir, seedDir, { recursive: true });

console.log(`Content bundle ready: ${outDir}`);
console.log(`Seed refreshed:       ${seedDir}`);
