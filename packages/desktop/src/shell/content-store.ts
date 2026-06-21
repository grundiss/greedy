// Owns the on-disk content layout: which version is active, the rollback target,
// the seed bootstrap, and pruning. The authoritative record of the active
// version is `state.json` (written atomically, last); the `current` symlink is a
// mirror of it for the app:// handler and human inspection.
import fs from 'node:fs';
import path from 'node:path';
import { MAX_RETAINED_VERSIONS } from './config.js';
import { log } from './logger.js';
import { contentRoot, currentLink, seedBundleDir, statePath, versionDir } from './paths.js';
import type { BundleMeta, ContentState } from './types.js';

const EMPTY_STATE: ContentState = {
  schemaVersion: 1,
  active: null,
  previous: null,
  knownGood: [],
  bad: [],
};

function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file); // atomic replace on the same filesystem
}

export function readState(): ContentState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as ContentState;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
  }
}

function writeState(state: ContentState): void {
  atomicWriteJson(statePath(), state);
}

// Reads + validates the bundle metadata in an arbitrary directory (a version
// dir, the staging dir, or the seed dir). Returns null if it's missing,
// malformed, or doesn't contain the files it advertises — so a corrupt/partial
// bundle is never treated as usable.
export function validateBundleDir(dir: string): BundleMeta | null {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8')) as BundleMeta;
    if (meta.schemaVersion !== 1 || !meta.paths) return null;
    const web = path.join(dir, meta.paths.web, 'index.html');
    const server = path.join(dir, meta.paths.server);
    const migrations = path.join(dir, meta.paths.migrations);
    if (!fs.existsSync(web) || !fs.existsSync(server) || !fs.existsSync(migrations)) return null;
    return meta;
  } catch {
    return null;
  }
}

export function readBundleMeta(version: string): BundleMeta | null {
  const meta = validateBundleDir(versionDir(version));
  if (!meta) return null;
  // The directory name must match the version it claims, or rollback bookkeeping
  // (which is keyed by version) would point at the wrong files.
  if (meta.version !== version) {
    log.warn(`bundle dir ${version} declares mismatched version ${meta.version}`);
    return null;
  }
  return meta;
}

export function isUsable(version: string | null): version is string {
  return !!version && readBundleMeta(version) !== null;
}

export function activeVersion(): string | null {
  const state = readState();
  return isUsable(state.active) ? state.active : null;
}

// Absolute paths the rest of the shell consumes for the active version.
export function activePaths(): {
  dir: string;
  web: string;
  server: string;
  migrations: string;
} | null {
  const v = activeVersion();
  if (!v) return null;
  const meta = readBundleMeta(v)!;
  const dir = versionDir(v);
  return {
    dir,
    web: path.join(dir, meta.paths.web),
    server: path.join(dir, meta.paths.server),
    migrations: path.join(dir, meta.paths.migrations),
  };
}

// Mirror the active version into the `current` symlink (best-effort; state.json
// remains authoritative). Relative target keeps it valid if userData moves.
function refreshCurrentLink(version: string): void {
  try {
    const link = currentLink();
    const tmp = `${link}.tmp`;
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    fs.symlinkSync(version, tmp, 'dir');
    fs.renameSync(tmp, link); // atomic replace
  } catch (err) {
    log.warn('could not update current symlink (non-fatal):', err);
  }
}

// THE atomic switch. state.json (authoritative) is written first and atomically;
// the symlink mirror follows. `previous` is set to the prior active so rollback
// has a target.
export function switchTo(version: string): void {
  if (!isUsable(version)) throw new Error(`refusing to switch to unusable version ${version}`);
  const state = readState();
  const next: ContentState = {
    ...state,
    previous: state.active && state.active !== version ? state.active : state.previous,
    active: version,
    bad: state.bad.filter((v) => v !== version),
  };
  writeState(next);
  refreshCurrentLink(version);
  log.info(`switched active content -> ${version} (previous: ${next.previous ?? 'none'})`);
}

export function markKnownGood(version: string): void {
  const state = readState();
  if (!state.knownGood.includes(version)) {
    writeState({
      ...state,
      knownGood: [...state.knownGood, version],
      bad: state.bad.filter((v) => v !== version),
    });
  }
}

export function markBad(version: string): void {
  const state = readState();
  writeState({
    ...state,
    bad: state.bad.includes(version) ? state.bad : [...state.bad, version],
    knownGood: state.knownGood.filter((v) => v !== version),
  });
}

// The version to fall back to when an apply fails: the recorded `previous` if
// it's known-good and still usable, else any other known-good version, else the
// freshly-seeded version. Returns null only if nothing usable exists at all.
export function rollbackTarget(failed: string): string | null {
  const state = readState();
  const candidates = [state.previous, ...state.knownGood].filter(
    (v): v is string => !!v && v !== failed && !state.bad.includes(v) && isUsable(v),
  );
  return candidates[0] ?? null;
}

// First-launch (or recovery) bootstrap: if there's no usable active version,
// install the seed bundle shipped inside the app and make it active+known-good.
export function ensureSeeded(): void {
  if (activeVersion()) return;

  const seedDir = seedBundleDir();
  let meta: BundleMeta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(seedDir, 'bundle.json'), 'utf8')) as BundleMeta;
  } catch (err) {
    throw new Error(
      `no active content and the seed bundle at ${seedDir} is unreadable: ${String(err)}`,
    );
  }

  const dest = versionDir(meta.version);
  if (!readBundleMeta(meta.version)) {
    log.info(`seeding content version ${meta.version} from ${seedDir}`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(contentRoot(), { recursive: true });
    fs.cpSync(seedDir, dest, { recursive: true });
    if (!readBundleMeta(meta.version)) {
      fs.rmSync(dest, { recursive: true, force: true });
      throw new Error(`seed bundle ${meta.version} failed validation after copy`);
    }
  }
  switchTo(meta.version);
  markKnownGood(meta.version);
}

// After a successful apply, drop versions we no longer need. Never removes the
// active version, the rollback `previous`, or anything still listed bad (kept
// for diagnostics until it ages out). Keeps the newest MAX_RETAINED_VERSIONS.
export function prune(): void {
  const state = readState();
  let entries: string[];
  try {
    entries = fs
      .readdirSync(contentRoot(), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '.staging')
      .map((d) => d.name);
  } catch {
    return;
  }
  const keep = new Set<string>([state.active, state.previous].filter((v): v is string => !!v));
  // Keep the newest few by directory mtime so a recent rollback target survives.
  const byRecency = entries
    .map((name) => ({ name, mtime: safeMtime(path.join(contentRoot(), name)) }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_RETAINED_VERSIONS)
    .map((e) => e.name);
  byRecency.forEach((v) => keep.add(v));

  for (const name of entries) {
    if (keep.has(name)) continue;
    log.info(`pruning old content version ${name}`);
    fs.rmSync(path.join(contentRoot(), name), { recursive: true, force: true });
  }
  // Forget bad/knownGood entries whose directories are gone.
  const present = new Set(
    fs.existsSync(contentRoot())
      ? fs
          .readdirSync(contentRoot(), { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [],
  );
  writeState({
    ...readState(),
    bad: state.bad.filter((v) => present.has(v)),
    knownGood: state.knownGood.filter((v) => present.has(v)),
  });
}

function safeMtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}
