// Packs a built content bundle into a signed, publishable update:
//
//   content-dist/Greedy-content-<version>.tar.gz   the archive
//   content-dist/manifest.json                     signed manifest pointing at it
//
// The manifest is signed with the ed25519 PRIVATE key (keys/content-private-key.pem,
// or $CONTENT_PRIVATE_KEY / $CONTENT_PRIVATE_KEY_PEM in CI). The shell verifies it
// against the bundled public key before trusting the archive.
//
//   node scripts/pack-content.mjs
//   CONTENT_VERSION=1.0.3 node scripts/pack-content.mjs
//   ARCHIVE_URL=https://host/path/file.tar.gz node scripts/pack-content.mjs  # absolute url
//
// archive.url defaults to the bare filename (relative), resolved by the shell
// against the manifest URL — so the same manifest works on GitHub Releases, a
// local test server, or any static host that serves both files together.
import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const version = process.env.CONTENT_VERSION ?? pkg.version;

const bundleDir = path.join(pkgDir, 'content-build', version);
if (!existsSync(path.join(bundleDir, 'bundle.json'))) {
  console.error(`No built bundle at ${bundleDir}. Run build-content.mjs first.`);
  process.exit(1);
}

// Deterministic JSON — MUST match canonicalize() in src/shell/verify.ts byte for byte.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

function loadPrivateKey() {
  const inline = process.env.CONTENT_PRIVATE_KEY_PEM;
  if (inline) return createPrivateKey(inline);
  const keyPath =
    process.env.CONTENT_PRIVATE_KEY ?? path.join(pkgDir, 'keys', 'content-private-key.pem');
  if (!existsSync(keyPath)) {
    console.error(
      `Signing key not found at ${keyPath}.\n` +
        `Run "node scripts/gen-keys.mjs" once, or set CONTENT_PRIVATE_KEY / CONTENT_PRIVATE_KEY_PEM.`,
    );
    process.exit(1);
  }
  return createPrivateKey(readFileSync(keyPath));
}

const distDir = path.join(pkgDir, 'content-dist');
mkdirSync(distDir, { recursive: true });
const archiveName = `Greedy-content-${version}.tar.gz`;
const archivePath = path.join(distDir, archiveName);
rmSync(archivePath, { force: true });

// Archive contains a single top-level dir `<version>/...`; the shell extracts
// with strip:1 so files land directly in content/<version>/.
console.log(`Packing ${bundleDir} -> ${archivePath}`);
await tar.c({ gzip: true, file: archivePath, cwd: path.join(pkgDir, 'content-build') }, [version]);

const bytes = readFileSync(archivePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const size = statSync(archivePath).size;
const meta = JSON.parse(readFileSync(path.join(bundleDir, 'bundle.json'), 'utf8'));

const unsigned = {
  schemaVersion: 1,
  version,
  minShellVersion: meta.minShellVersion,
  archive: { url: process.env.ARCHIVE_URL ?? archiveName, sha256, size },
  releasedAt: new Date().toISOString(),
  ...(process.env.RELEASE_NOTES ? { notes: process.env.RELEASE_NOTES } : {}),
};

const signature = cryptoSign(
  null,
  Buffer.from(canonicalize(unsigned), 'utf8'),
  loadPrivateKey(),
).toString('base64');
const manifest = { ...unsigned, signature };
writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Wrote ${path.join(distDir, 'manifest.json')}`);
console.log(`  version : ${version}`);
console.log(`  sha256  : ${sha256}`);
console.log(`  size    : ${size} bytes`);
console.log(`  url     : ${manifest.archive.url}`);
