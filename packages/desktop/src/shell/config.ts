// Static shell configuration. Everything that future content updates must NOT
// be able to change lives here (trust root, scheme, feed location). Values are
// overridable via env for local testing of the update/rollback flow.

// The custom scheme the renderer is served from. A privileged, secure, standard
// scheme (registered in protocol.ts) so the SPA gets a stable origin, the
// History API, and fetch — without a loopback HTTP origin for the UI itself.
export const APP_SCHEME = 'app';
export const APP_HOST = 'greedy.app';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

// Where the updater looks for `manifest.json`. Default: a fixed GitHub Release
// tag (`content-latest`) whose download URL is stable and static. Override for
// local testing, GitHub Pages, or any other static host.
export const UPDATE_FEED_URL =
  process.env.GREEDY_UPDATE_URL ??
  'https://github.com/grundiss/greedy/releases/download/content-latest/manifest.json';

// How long to wait after launch before the first content-update check, and how
// often to re-check while running. Kept conservative — this is a single-user
// desktop app, not a server.
export const INITIAL_CHECK_DELAY_MS = 8_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

// Retain this many content versions on disk (active + N-1 for rollback). Older
// ones are pruned after a successful apply.
export const MAX_RETAINED_VERSIONS = 3;

// The Electron-shell binary auto-update (electron-updater / GitHub Releases) is
// a SEPARATE, infrequent channel from content updates. It is a no-op until the
// app is signed + notarized, and off by default to avoid two competing update
// paths. Flip on once signing is in place and a genuine shell change ships.
export const ENABLE_SHELL_AUTOUPDATE = process.env.GREEDY_SHELL_AUTOUPDATE === '1';

// Allow opting out of content updates entirely (e.g. during development of the
// shell itself, or for an offline/locked deployment).
export const CONTENT_UPDATES_ENABLED = process.env.GREEDY_DISABLE_UPDATES !== '1';
