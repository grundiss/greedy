// Publishes a packed content update to a fixed GitHub Release tag (default
// `content-latest`), uploading manifest.json + the archive with --clobber so the
// feed URL is stable and always points at the newest content. Requires the `gh`
// CLI authenticated with repo write access (GH_TOKEN in CI).
//
//   node scripts/pack-content.mjs && node scripts/publish-content.mjs
//
// Alternatives (see docs/CONTENT_UPDATES.md): commit content-dist/ to a gh-pages
// branch, or rsync it to any static host, and point GREEDY_UPDATE_URL there.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const version = process.env.CONTENT_VERSION ?? pkg.version;
const tag = process.env.CONTENT_RELEASE_TAG ?? 'content-latest';

const distDir = path.join(pkgDir, 'content-dist');
const manifest = path.join(distDir, 'manifest.json');
const archive = path.join(distDir, `Greedy-content-${version}.tar.gz`);
for (const f of [manifest, archive]) {
  if (!existsSync(f)) {
    console.error(`Missing ${f}. Run build-content.mjs + pack-content.mjs first.`);
    process.exit(1);
  }
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { stdio: 'inherit', ...opts });
}

// Ensure the release exists (create once; ignore "already exists").
let exists = true;
try {
  execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
} catch {
  exists = false;
}
if (!exists) {
  console.log(`Creating release ${tag}`);
  gh([
    'release',
    'create',
    tag,
    '--title',
    'Greedy content (latest)',
    '--notes',
    'Rolling content-update feed. Assets are replaced on each publish.',
  ]);
}

console.log(`Uploading content ${version} to ${tag}`);
gh(['release', 'upload', tag, manifest, archive, '--clobber']);
console.log('Published.');
