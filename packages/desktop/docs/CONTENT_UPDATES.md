# Content updates

Greedy's desktop app is a **stable Electron shell** that runs **signed content
bundles**. Day-to-day changes (frontend, backend, migrations, assets) ship as
content updates — no new app binary, no code signing, no app store, no server.

The shell only changes when you genuinely need new shell capabilities (a new
Electron, a change to the updater/protocol/runtime itself, or a new public key).

---

## What's in the shell vs. a content bundle

| Lives in the **shell** (static, in the `.app`)        | Lives in a **content bundle** (updatable)    |
| ----------------------------------------------------- | -------------------------------------------- |
| Electron main + preload (`src/main.ts`, `preload.ts`) | The React SPA build (`web/`)                 |
| The content updater + `app://` protocol               | The backend server code (`server/index.mjs`) |
| PGlite driver + drizzle migration **runner**          | The migration **SQL files** (`drizzle/`)     |
| The bundled **public key** (trust root)               | `bundle.json` metadata                       |

The shell never executes code it hasn't verified. The backend in a bundle is
loaded with a dynamic `import()` **only after** the bundle's manifest signature
and the archive's SHA-256 have both passed.

## On-disk layout (`app.getPath('userData')`)

```
content/
  <version>/            extracted, verified bundles: web/ server/ drizzle/ bundle.json
  current               symlink -> content/<active version>   (atomically swapped)
  state.json            { active, previous, knownGood[], bad[] }   (authoritative)
  .staging/             in-flight downloads/extractions (never trusted)
greedy-db/              the PGlite database (persists across updates)
greedy-db.bak/          transient pre-migration snapshot (apply only)
logs/updater.log        rolling updater log
```

On first launch the shell installs the **seed bundle** shipped inside the app
(`Contents/Resources/content-seed`) into `content/<seedVersion>` and marks it
active + known-good.

## The update lifecycle (automatic)

The user is **informed** but never has to act. Two phases:

1. **Acquire (safe — app untouched):** fetch `manifest.json` → verify its ed25519
   signature → download the archive → check SHA-256 == manifest → extract into
   `.staging` → validate the bundle's structure → promote into `content/<version>`.
   Any failure here just clears `.staging`; the running app keeps its current
   version.
2. **Activate (reversible):** stop the backend → close + **snapshot** the DB →
   atomically switch `current`/`state.json` → run migrations → restart the
   backend from the new bundle → re-create the window (picks up the new loopback
   API URL). On **any** failure: restore the DB snapshot, switch back to the last
   known-good version, restart it, and mark the failed version `bad` so it's never
   retried.

The renderer shows `available → downloading → installed` (or
`update failed — safely restored …`). See `web/src/components/UpdateNotice.tsx`.

## Manifest format

```jsonc
{
  "schemaVersion": 1,
  "version": "1.0.3",
  "minShellVersion": "1.0.2", // skip the update if the installed shell is older
  "archive": {
    "url": "Greedy-content-1.0.3.tar.gz", // absolute, or relative to the manifest URL
    "sha256": "<hex>",
    "size": 507470,
  },
  "releasedAt": "2026-06-21T00:00:00Z",
  "notes": "optional",
  "signature": "<base64 ed25519 over the canonical manifest sans `signature`>",
}
```

`canonicalize()` (sorted keys, no whitespace) is identical in
`src/shell/verify.ts` and `scripts/pack-content.mjs` — they must stay byte-for-byte
in sync or signatures won't verify.

---

## Releasing a content update

```bash
# 0. One-time: create the signing keypair (commits the public key into the shell,
#    writes the gitignored private key to keys/). Treat the private key as a secret.
yarn gen:keys

# 1. Build everything + assemble the bundle (also refreshes content-seed/).
yarn build                       # shared + api + web
yarn content:build               # -> packages/desktop/content-build/<version>/

# 2. Pack + sign -> content-dist/manifest.json + Greedy-content-<version>.tar.gz
yarn content:pack

# 3. Publish to the fixed GitHub Release tag `content-latest` (stable feed URL).
yarn content:publish             # needs `gh` authed; GH_TOKEN in CI

# …or do 1–3 in one go from a clean build:
yarn content:release
```

The bundle **version** comes from `packages/desktop/package.json` `version`, or
`CONTENT_VERSION=…` to override. Bump it for every content release — the shell
only applies a bundle that is strictly newer than the active version.

### Choosing the feed (static, no server)

The shell reads `GREEDY_UPDATE_URL`, defaulting to:

```
https://github.com/grundiss/greedy/releases/download/content-latest/manifest.json
```

Because `archive.url` is relative by default, the **same** manifest works on:

- **GitHub Releases** — `yarn content:publish` (default).
- **GitHub Pages** — commit `content-dist/` to `gh-pages`; point the URL at
  `https://grundiss.github.io/greedy/manifest.json`.
- **Any static host** — upload `manifest.json` + the `.tar.gz` together; set
  `ARCHIVE_URL=` when packing if they live at different paths.

---

## Testing update + rollback locally

You don't need to publish anything.

```bash
# Build the CURRENT content as the seed (so the app boots on 1.0.2):
yarn build && yarn content:build

# Build + pack a NEWER bundle to update INTO (bumped version):
CONTENT_VERSION=1.0.3 yarn content:build
CONTENT_VERSION=1.0.3 yarn content:pack

# Serve content-dist/ locally:
yarn content:serve                 # http://localhost:8787/manifest.json

# In another shell, launch the app pointed at the local feed:
GREEDY_UPDATE_URL=http://localhost:8787/manifest.json \
  yarn workspace @greedy/desktop start
```

Within a few seconds the app finds 1.0.3, downloads, verifies, applies, and the
window reloads showing "Updated to 1.0.3". Watch `userData/logs/updater.log`.

**Test rollback** by publishing a deliberately broken 1.0.3 — e.g. edit its
`content-build/1.0.3/server/index.mjs` to `throw` on import, then re-pack. The
app will fail to start the new backend, restore the DB snapshot, switch back to
1.0.2, mark 1.0.3 bad, and show "update failed — safely restored 1.0.2".

Useful env vars:

- `GREEDY_UPDATE_URL` — point at any manifest.
- `GREEDY_DISABLE_UPDATES=1` — turn the content updater off.
- `GREEDY_SHELL_AUTOUPDATE=1` — enable the separate electron-updater channel
  (binary updates; a no-op until the app is signed).

---

## Key rotation

The public key is the static trust root, compiled into the shell. Rotating it is
a **shell** change: `yarn gen:keys --force`, ship a new app build, and re-sign
future manifests with the new private key. Manifests signed by the old key stop
verifying, by design.
