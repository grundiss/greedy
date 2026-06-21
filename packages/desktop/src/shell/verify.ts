// The trust boundary. NOTHING downloaded is acted on until it has passed:
//   1. manifest signature  — ed25519 over the canonical manifest, against the
//      public key compiled into the shell (content-public-key.ts).
//   2. archive hash         — SHA-256 of the downloaded bytes === manifest.sha256.
// Because the manifest is signed AND pins the archive's hash, verifying the
// manifest's signature + matching the hash authenticates the archive end-to-end.
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { CONTENT_PUBLIC_KEY_PEM } from './content-public-key.js';
import type { UpdateManifest } from './types.js';

const publicKey = createPublicKey(CONTENT_PUBLIC_KEY_PEM);

// Deterministic JSON: keys sorted recursively, no insignificant whitespace. Both
// the signer (pack-content.mjs) and verifier must produce identical bytes, so
// this routine is intentionally simple and total.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

// Throws on any structural problem, so callers can treat a returned manifest as
// well-formed. Does NOT verify the signature — call verifyManifestSignature().
export function parseManifest(raw: unknown): UpdateManifest {
  if (!raw || typeof raw !== 'object') throw new Error('manifest is not an object');
  const m = raw as Record<string, unknown>;
  const fail = (msg: string): never => {
    throw new Error(`invalid manifest: ${msg}`);
  };

  if (m.schemaVersion !== 1) fail(`unsupported schemaVersion ${String(m.schemaVersion)}`);
  if (typeof m.version !== 'string' || !m.version) fail('missing version');
  if (typeof m.minShellVersion !== 'string' || !m.minShellVersion) fail('missing minShellVersion');
  if (typeof m.signature !== 'string' || !m.signature) fail('missing signature');
  const a = m.archive as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') fail('missing archive');
  if (typeof a!.url !== 'string' || !a!.url) fail('missing archive.url');
  if (typeof a!.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a!.sha256))
    fail('bad archive.sha256');
  if (typeof a!.size !== 'number' || a!.size <= 0) fail('bad archive.size');
  if (typeof m.releasedAt !== 'string') fail('missing releasedAt');
  return raw as UpdateManifest;
}

// ed25519 verify over the canonical manifest with the `signature` field removed.
export function verifyManifestSignature(manifest: UpdateManifest): boolean {
  const { signature, ...unsigned } = manifest;
  const message = Buffer.from(canonicalize(unsigned), 'utf8');
  let sig: Buffer;
  try {
    sig = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  try {
    // ed25519: algorithm arg must be null; the key carries the curve.
    return cryptoVerify(null, message, publicKey, sig);
  } catch {
    return false;
  }
}

// Streams the file so a large archive never has to sit in memory.
export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Constant-time-ish equality for hex digests (same length, lowercased).
export function hashesMatch(a: string, b: string): boolean {
  return a.length === b.length && a.toLowerCase() === b.toLowerCase();
}
