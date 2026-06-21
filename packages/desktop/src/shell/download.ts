// Network + extraction. Everything here writes only into the .staging area and
// returns plain data; nothing it produces is trusted until verify.ts has run and
// content-store has accepted it. Uses the Node global fetch (present in the
// Electron main process) so this module is also exercisable in plain Node tests.
import fs from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { parseManifest, verifyManifestSignature } from './verify.js';
import type { UpdateManifest } from './types.js';

const FETCH_TIMEOUT_MS = 30_000;
// Hard ceiling so a malicious/huge archive can't fill the disk before the size
// check. Generous for a content bundle (web build + server + migrations).
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchedManifest {
  manifest: UpdateManifest;
  // Base URL that relative archive URLs are resolved against. This is the
  // ORIGINAL feed URL, NOT the post-redirect `res.url`. On GitHub Releases the
  // feed URL (github.com/.../releases/download/<tag>/manifest.json) 302-redirects
  // to a *signed, single-asset* URL on release-assets.githubusercontent.com with
  // a `?jwt=…&sig=…` token. Resolving a relative archive name against that
  // redirected URL drops the token and rewrites the opaque path, so the archive
  // request comes back as HTTP 618 `jwt:jwt-not-provided`. The stable github.com
  // feed URL, by contrast, mints a fresh token for whatever asset you request —
  // so relative resolution must happen against it, not against where it landed.
  baseUrl: string;
}

// Fetches, parses, and authenticates the manifest. Throws if the signature does
// not verify against the bundled public key — the first gate every update passes.
export async function fetchManifest(feedUrl: string): Promise<FetchedManifest> {
  const res = await fetchWithTimeout(feedUrl, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`manifest fetch failed: HTTP ${res.status}`);
  const manifest = parseManifest(await res.json());
  if (!verifyManifestSignature(manifest)) {
    throw new Error('manifest signature verification FAILED — refusing the update');
  }
  return { manifest, baseUrl: feedUrl };
}

export type ProgressFn = (receivedBytes: number, totalBytes: number) => void;

// Streams the archive to `destPath`, counting bytes for progress. The archive
// URL may be relative, resolved against `baseUrl` (the original feed URL) so a
// manifest is host-portable. Returns bytes written. Does NOT verify — caller
// hashes the file.
export async function downloadArchive(
  manifest: UpdateManifest,
  baseUrl: string,
  destPath: string,
  onProgress?: ProgressFn,
): Promise<number> {
  const url = new URL(manifest.archive.url, baseUrl).toString();
  const res = await fetchWithTimeout(url);
  if (!res.ok || !res.body) throw new Error(`archive fetch failed: HTTP ${res.status}`);

  const declared = manifest.archive.size;
  const headerLen = Number(res.headers.get('content-length') ?? declared);
  const total = Number.isFinite(headerLen) && headerLen > 0 ? headerLen : declared;

  await mkdir(path.dirname(destPath), { recursive: true });
  let received = 0;
  // Tee the web stream through a byte counter, enforcing the size ceiling so a
  // runaway response is aborted before it fills the disk.
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_ARCHIVE_BYTES) {
        cb(new Error('archive exceeds maximum allowed size'));
        return;
      }
      onProgress?.(received, total);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(source, counter, fs.createWriteStream(destPath));
  } catch (err) {
    await rm(destPath, { force: true });
    throw err;
  }

  if (declared && received !== declared) {
    await rm(destPath, { force: true });
    throw new Error(`archive size mismatch: got ${received}, manifest declared ${declared}`);
  }
  return received;
}

// Extracts a .tar.gz into `destDir`. Guards against path traversal (entries
// escaping the destination) by rejecting absolute paths and `..` segments.
export async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await tar.x({
    file: archivePath,
    cwd: destDir,
    // Strip the single top-level directory the packer adds, so files land
    // directly under destDir (bundle.json, web/, server/, drizzle/).
    strip: 1,
    filter: (entryPath) => {
      const normalized = path.normalize(entryPath);
      return !path.isAbsolute(normalized) && !normalized.split(path.sep).includes('..');
    },
    // Refuse symlinks/hardlinks and absolute paths outright — content bundles
    // are plain files only.
    preservePaths: false,
  });
}
