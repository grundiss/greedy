// Canonical on-disk layout, all rooted under Electron's userData. Centralised so
// no other module hardcodes a path. Layout:
//
//   <userData>/
//     content/
//       <version>/            extracted, verified bundles (web/, server/, drizzle/)
//       current               symlink -> content/<active version>  (atomic switch)
//       state.json            ContentState (active/previous/knownGood/bad)
//       .staging/             in-flight downloads + extractions (never trusted)
//     greedy-db/              the PGlite data directory (persists across updates)
//     greedy-db.bak/          transient pre-migration snapshot (created on apply)
//     logs/updater.log        rolling updater log
//     content-seed/ (in app resources, NOT here) — bootstrap bundle, see content-store
import { app } from 'electron';
import path from 'node:path';

export function userData(): string {
  return app.getPath('userData');
}

export function contentRoot(): string {
  return path.join(userData(), 'content');
}

export function stagingDir(): string {
  return path.join(contentRoot(), '.staging');
}

export function statePath(): string {
  return path.join(contentRoot(), 'state.json');
}

// The atomically-swapped pointer to the active version directory.
export function currentLink(): string {
  return path.join(contentRoot(), 'current');
}

export function versionDir(version: string): string {
  return path.join(contentRoot(), version);
}

export function dbDir(): string {
  return path.join(userData(), 'greedy-db');
}

export function dbBackupDir(): string {
  return path.join(userData(), 'greedy-db.bak');
}

export function logDir(): string {
  return path.join(userData(), 'logs');
}

// The seed bundle shipped inside the app (electron-builder extraResources).
// Used to bootstrap content/ on first launch (or recover if it's wiped).
export function seedBundleDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'content-seed');
  // dev: packages/desktop/dist/main.js -> packages/desktop
  return path.join(app.getAppPath(), 'content-seed');
}
