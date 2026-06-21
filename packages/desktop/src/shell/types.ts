// Shared types for the content-update system. These describe the on-the-wire
// `manifest.json`, the in-bundle `bundle.json`, the on-disk content store state,
// and the status events pushed to the renderer.

// Remote update descriptor, fetched from the static update feed and signed by
// the release private key. `signature` covers the canonical JSON of every OTHER
// field (see verify.ts / canonicalize()).
export interface UpdateManifest {
  // Bump when the manifest shape changes incompatibly.
  schemaVersion: 1;
  // Semver of the content bundle this manifest points at.
  version: string;
  // Minimum shell (app) version required to run this bundle. If the installed
  // shell is older, the update is skipped (the user needs a shell update first).
  minShellVersion: string;
  archive: {
    // Absolute URL, or relative — resolved against the manifest URL. Lets the
    // same manifest work on GitHub Releases, Pages, or any static host.
    url: string;
    // Lowercase hex SHA-256 of the archive bytes.
    sha256: string;
    // Archive size in bytes (advisory; used for progress + a sanity check).
    size: number;
  };
  releasedAt: string;
  notes?: string;
  // base64 ed25519 signature over canonicalize(manifest without `signature`).
  signature: string;
}

// Metadata embedded INSIDE the bundle (content/<version>/bundle.json). Lets the
// runtime validate an extracted bundle's shape independently of the manifest.
export interface BundleMeta {
  schemaVersion: 1;
  version: string;
  minShellVersion: string;
  createdAt: string;
  // Relative paths within the bundle, so the shell never hardcodes layout.
  paths: {
    web: string; // e.g. "web" (contains index.html)
    server: string; // e.g. "server/index.mjs" (ESM entry exporting start())
    migrations: string; // e.g. "drizzle" (drizzle-kit migrations folder)
  };
}

// Persistent store state (content/state.json). Drives rollback + pruning.
export interface ContentState {
  schemaVersion: 1;
  // The version `current` points at right now.
  active: string | null;
  // The last known-good version before `active` — the rollback target.
  previous: string | null;
  // Versions that booted successfully at least once (rollback-safe targets).
  knownGood: string[];
  // Versions that failed to apply/boot — never auto-selected again.
  bad: string[];
}

// Status pushed to the renderer over IPC so the UI can inform the user. The
// update completes automatically; these are notifications, not prompts.
export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date'; version: string }
  | { phase: 'available'; version: string; notes?: string }
  | { phase: 'downloading'; version: string; receivedBytes: number; totalBytes: number }
  | { phase: 'verifying'; version: string }
  | { phase: 'applying'; version: string }
  | { phase: 'installed'; version: string }
  | { phase: 'rolled-back'; failedVersion: string; activeVersion: string | null; error: string }
  | { phase: 'error'; error: string; version?: string };
