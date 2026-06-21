# AGENTS.md

Guidance for AI assistants working in this repo. Keep this file current when you
change architecture, workflows, or conventions.

## What this is

**Greedy** is a single-user tool for a TikTok creator to track their videos and
audience engagement over time. There is exactly one user (the owner), so there
is **no auth, no multi-tenancy, and no security layer** — do not add them unless
asked.

The app has three primary desktop workflows:

- **Data input**: add videos, and log timestamped _updates_ of engagement metrics.
- **Videos**: browse the saved video catalog in a scannable desktop list/table.
- **Reports**: pick a video and view its metrics as time series.
- **Settings**: export the full database as a Greedy SQL dump, or import one to
  replace the local data.

## Stack & layout

TypeScript monorepo (Yarn workspaces). Four packages under `packages/`:

| Package    | Name              | Role                                                        |
| ---------- | ----------------- | ----------------------------------------------------------- |
| `shared/`  | `@greedy/shared`  | DTOs/types shared by api + web. Built to `dist/` (watched). |
| `api/`     | `@greedy/api`     | Fastify server + Drizzle schema/migrations.                 |
| `web/`     | `@greedy/web`     | React 19 + Vite + Tailwind v4 frontend.                     |
| `desktop/` | `@greedy/desktop` | Static Electron **shell** that runs signed content bundles. |

Dev runs in Docker Compose (postgres + shared + api + web) with hot reload. The
**desktop build** is a separate target: a thin, static Electron shell that loads
the active **content bundle** (frontend + backend + migrations) from `userData`,
serves the SPA over a custom `app://` protocol, runs the backend on a loopback
port, and swaps Postgres for **PGlite** (embedded WASM Postgres) under `userData`.
Frontend/backend/migration changes ship as **content updates**, not new app
binaries — see the section below and
[`packages/desktop/docs/CONTENT_UPDATES.md`](packages/desktop/docs/CONTENT_UPDATES.md).

## Two DB drivers, one app

The API is driver-agnostic. `buildApp({ db, ... })`
([`src/app.ts`](packages/api/src/app.ts)) decorates the injected Drizzle db onto
Fastify, so routes use **`app.db`** — never a module singleton. Concrete drivers:
`createPostgresDb` ([`src/db/postgres.ts`](packages/api/src/db/postgres.ts), dev/server)
and `createPgliteDb` ([`src/db/pglite.ts`](packages/api/src/db/pglite.ts), desktop).
Both speak the `pg-core` dialect, so queries and the `drizzle/` migrations are
identical across them. `startServer()` ([`src/server.ts`](packages/api/src/server.ts))
listens and resolves the real bound port (the desktop binds `port: 0`).
[`src/index.ts`](packages/api/src/index.ts) is the standalone (Postgres) entry.

## Desktop shell & content updates (read before touching `desktop/`)

The desktop app is a **static Electron shell** that runs **signed content
bundles**. The shell is stable infrastructure; app features live in bundles and
update independently. There is **no paid dev license, no paid code signing, and
no persistent server** — the updater pulls from a static source (GitHub Releases
by default).

**The shell ↔ content split (this is the load-bearing idea):**

- **Shell** (`packages/desktop/src/main.ts`, `src/shell/*`, `src/preload.ts`,
  bundled into the `.app`): the updater, the `app://` protocol, the PGlite driver
  and the drizzle migration **runner**, the BrowserWindow, and the **bundled
  ed25519 public key** (`src/shell/content-public-key.ts`) — the static trust root.
- **Content bundle** (`web/` + `server/index.mjs` + `drizzle/` + `bundle.json`):
  the React build, the backend code, and the migration **SQL**. Built by
  `scripts/build-content.mjs`; the same files are shipped inside the app as the
  **seed** (`content-seed/`, via electron-builder `extraResources`) to bootstrap
  first launch.

**Runtime wiring** (`src/shell/`):

- `content-store.ts` — on-disk layout under `userData/content/`: `<version>/`
  dirs, the atomically-swapped `current` symlink, `state.json`
  (`active`/`previous`/`knownGood`/`bad`), seed bootstrap, rollback target
  selection, pruning. `state.json` is the authoritative record (written last,
  atomically); the symlink mirrors it.
- `runtime.ts` — owns the PGlite DB (persists across updates) and the backend.
  The backend's **code** comes from the active bundle, loaded via dynamic
  `import()` — the **only** place the shell runs bundle-provided code, and only
  after verification. DB driver + migrator stay in the shell.
- `protocol.ts` — the privileged `app://greedy.app` scheme that serves the active
  bundle's `web/` (SPA fallback to `index.html`), with a strict CSP.
- `updater.ts` — the two-phase flow (see CONTENT_UPDATES.md): **acquire** (check
  → download → verify SHA-256 + signature → extract → promote; failures never
  touch the running app) then **activate** (stop → snapshot DB → atomic switch →
  migrate → restart → recreate window; any failure rolls back to the last
  known-good version and restores the DB snapshot).
- `verify.ts` — the trust boundary: ed25519 manifest signature + SHA-256 archive
  hash. `canonicalize()` here MUST match `scripts/pack-content.mjs` byte-for-byte.

**Renderer ↔ shell:** the renderer loads from `app://` and reaches the backend at
the loopback URL injected by the preload as `window.greedy.apiBaseUrl` (read in
`web/src/lib/api.ts`). CORS on the backend is restricted to the `app://` origin.
Update status reaches the UI via `window.greedy.onUpdateStatus`
(`web/src/components/UpdateNotice.tsx`). Updates are **automatic**; the UI only
informs.

### Security rules (do not weaken)

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`. The
  preload (`src/preload.ts`) is the ONLY renderer↔main bridge — keep it tiny; do
  not expose Node, `fs`, or generic IPC.
- Nothing downloaded runs until BOTH the manifest signature (against the bundled
  public key) AND the archive SHA-256 verify. Never bypass `verify.ts` or relax
  the order in `updater.ts`.
- The public key is the static trust root. Rotating it is a shell change
  (`yarn gen:keys --force` + new app build). The private key
  (`packages/desktop/keys/`) is a secret — gitignored, never committed.
- Keep the `app://` CSP strict; the renderer must never load remote code.

### Conventions for changing each layer

- **Frontend / backend / migrations** → these are **content**. Make the change in
  `web/` / `api/` (incl. `schema.ts` + `yarn db:generate`), bump
  `packages/desktop/package.json` `version`, then `yarn content:release` (or test
  locally first, below). You do **not** rebuild the shell for these.
- **The shell itself** (updater, protocol, runtime, preload, Electron version,
  public key) → this is a real app release: rebuild + re-ship the `.app`
  (`yarn desktop:dist`), and bump `minShellVersion` on any future bundle that
  depends on the new shell behaviour.
- **The backend↔shell contract** (`src/content/server-entry.ts` `start()` and
  `BundleMeta`) is versioned by `bundle.json.schemaVersion` + `minShellVersion`.
  Changing it incompatibly means a shell release and a `minShellVersion` bump.
- Migrations are forward-only and must be safe to run against existing user data
  (the updater snapshots the DB before migrating and restores on failure, but a
  destructive migration that "succeeds" is still destructive).

### Desktop commands

```bash
yarn gen:keys                  # one-time: ed25519 keypair (public key -> shell)
yarn desktop:dev               # build shell + seed bundle, launch Electron
yarn desktop:dist              # package the .app/.dmg/.zip (the static shell)
yarn content:build             # assemble a content bundle (+ refresh the seed)
yarn content:pack              # tar + SHA-256 + sign -> content-dist/manifest.json
yarn content:publish           # upload to the `content-latest` GitHub Release
yarn content:release           # build + pack + publish in one shot
yarn content:serve             # serve content-dist/ locally to test updates
```

## Core domain model

Four tables in [`packages/api/src/db/schema.ts`](packages/api/src/db/schema.ts):

- **`videos`** — the content. Has descriptive fields (`title`, `description`,
  `durationSeconds`, `tags`) plus **editorial attributes** used for analysis:
  `publishedAt`, `hasFace`, `hookType` (`'none' | 'question' | 'result'`),
  `soundType` (`'music' | 'voice'`), `subtitles`. Enum-like columns are stored as
  `text` in the DB; the allowed values live as union types in shared
  (`HookType`, `SoundType`) and are validated server-side.
- **`updates`** — timestamped, per-video metric snapshots. **Every metric column
  (`likes`, `saves`, `depthPct`, `views`, `comments`, `reposts`, `newFollowers`)
  is nullable**, plus a nullable `hate` flag (whether hateful comments showed up).
  This is the central design decision: an update carries only the metric(s) the
  user entered at that moment (e.g. just `likes`). Reports plot each numeric
  metric using only the rows where it is non-null. `recordedAt` defaults to now
  but can be backdated. The POST requires **≥1 numeric metric** — `hate` is a flag
  that can't stand on its own.
- **`global_updates`** — account-level snapshots not tied to a video
  (`followers`).
- **`promotions`** — paid ad campaigns promoting one video. A row records that a
  video was promoted; `budget` and `followersGained` are both nullable details.
  Per-video like `updates`; the POST requires ≥1 of budget/followersGained.

> When adding a new per-video metric: add a nullable column to `updates`, the
> field to the `Update`/`NewUpdateInput` DTOs + `serializeUpdate`, the coercion +
> `≥1 metric` check in the update route, the export column list **and** import
> mapping in `dbDump.ts`, one input in the Log Update form, one column in the
> VideosPage updates-log table, and (numeric metrics only) one entry in the
> `METRICS` array in `ReportsPage.tsx`. When adding a new video attribute: column
> on `videos`, field on `Video`/`NewVideoInput`, a serializer line + validation in
> the API, and an input in the Add Video form.

> The DB dump (`dbDump.ts`) is versioned (`DUMP_VERSION`). Adding a table/column
> to the payload bumps it; keep the importer tolerant of older versions so old
> dumps still load (missing arrays → empty, missing fields → null).

## Key files

- API routes: [`packages/api/src/routes/videos.ts`](packages/api/src/routes/videos.ts)
  — all video/update endpoints, with `serializeVideo`/`serializeUpdate` (Date →
  ISO string) and coercion helpers (`toIntOrNull`, `toBoolOrNull`,
  `toEnumOrNull`, `toDateOrNull`, `clamp`). Routes registered in
  [`src/index.ts`](packages/api/src/index.ts) via `app.register(videoRoutes)`.
- Shared DTOs: [`packages/shared/src/index.ts`](packages/shared/src/index.ts)
  — the contract between api and web. **Dates cross the wire as ISO strings.**
- Web: [`src/App.tsx`](packages/web/src/App.tsx) (router + desktop sidebar nav),
  [`src/pages/InputPage.tsx`](packages/web/src/pages/InputPage.tsx),
  [`src/pages/VideosPage.tsx`](packages/web/src/pages/VideosPage.tsx),
  [`src/pages/ReportsPage.tsx`](packages/web/src/pages/ReportsPage.tsx),
  shared UI primitives in [`src/components/ui.tsx`](packages/web/src/components/ui.tsx),
  the typed fetch client in [`src/lib/api.ts`](packages/web/src/lib/api.ts),
  and database backup/restore UI in
  [`src/pages/SettingsPage.tsx`](packages/web/src/pages/SettingsPage.tsx).

## HTTP API

Base URL `http://localhost:3000`. JSON in/out. Errors are
`{ error, message }` with an appropriate status.

| Method | Path                     | Notes                                                             |
| ------ | ------------------------ | ----------------------------------------------------------------- |
| GET    | `/videos`                | List, newest first.                                               |
| POST   | `/videos`                | Create. Requires non-empty `title`.                               |
| GET    | `/videos/:id`            | Returns `VideoWithUpdates` (video + updates + promotions).        |
| DELETE | `/videos/:id`            | Cascades to its updates and promotions.                           |
| POST   | `/videos/:id/updates`    | Partial update. **Requires ≥1 metric**; `depthPct` clamped 0–100. |
| GET    | `/videos/:id/updates`    | Updates oldest-first.                                             |
| POST   | `/videos/:id/promotions` | Log an ad campaign. **Requires budget or followersGained.**       |
| GET    | `/videos/:id/promotions` | Promotions oldest-first.                                          |
| GET    | `/db/export`             | Downloads a Greedy SQL dump of all app data.                      |
| POST   | `/db/import`             | Imports a Greedy SQL dump and replaces current app data.          |

## Conventions

- **Types flow through `@greedy/shared`.** Don't redeclare DTOs in api/web;
  import them. Drizzle row types (`$inferSelect`) stay in the api and are mapped
  to the shared serializable DTOs by the `serialize*` functions.
- ESM throughout; intra-package imports use explicit `.js` extensions
  (`./routes/videos.js`) per the TS/ESM setup.
- Desktop-first UI: prefer spacious multi-column layouts, sidebar navigation,
  scannable tables/lists, and efficient pointer/keyboard workflows over
  mobile-first constraints. Keep `inputMode="numeric"` for number fields where it
  improves validation, and keep the Log Update form selected video after submit
  for fast repeat entry.
- Formatting is Prettier (Husky pre-commit runs lint-staged). Run
  `yarn format` / `yarn typecheck` before finishing.
- **Desktop changes are content, not shell changes** unless you're touching the
  updater/protocol/runtime/preload itself. See the desktop section above for the
  rules and the release vs. content-update distinction.

## Workflows

```bash
yarn install                       # host deps (Husky, db tooling, typecheck)
yarn dev                           # docker compose up: postgres + shared + api + web
yarn db:generate && yarn db:migrate  # after any schema.ts change
yarn typecheck                     # all workspaces
```

- **API**: http://localhost:3000 (`GET /health`). **Web**: http://localhost:5173.
- `db:*` scripts run on the **host** against the Compose Postgres (port 5432
  published), so the stack must be `up` first.

## Gotchas (read before debugging)

- **Dependency changes need fresh anon volumes.** The dev images bake
  `node_modules`, and Compose masks them with **anonymous volumes** that persist
  across `up`. After editing any `package.json`, run
  `docker compose up -d --build -V` (the `-V` renews anon volumes) — otherwise
  containers keep stale deps and you'll see "Failed to resolve import …".
- **`drizzle.config.ts` uses `process.cwd()`**, not `import.meta.dirname`. The
  latter is empty under drizzle-kit's CJS bundling and breaks `db:generate`.
  drizzle-kit runs from the `api` package dir, so the root `.env` is at `../../`.
- **Schema changes require a migration.** Edit `schema.ts`, then
  `yarn db:generate` (creates a file in `packages/api/drizzle/`) and
  `yarn db:migrate`. Don't hand-edit generated SQL.
- After changing `@greedy/shared`, the `shared` watcher rebuilds `dist/`; if you
  run pieces outside Docker, build it first (`yarn workspace @greedy/shared build`).
- **`canonicalize()` must match across the boundary.** The signer
  (`packages/desktop/scripts/pack-content.mjs`) and the verifier
  (`packages/desktop/src/shell/verify.ts`) build the signed bytes the same way; if
  they drift, every manifest fails to verify. Keep them identical.
- **The seed is a build artifact.** `content-seed/` is regenerated by
  `yarn content:build` from the current `web`/`api` builds and shipped via
  `extraResources`. It's gitignored — rebuild it before `yarn desktop:dist`
  (`yarn build:desktop` does this for you).

## Verifying changes

Prefer driving the running app over manual checks. The stack exposes the API on
:3000 and web on :5173. Quick API smoke test:

```bash
ID=$(curl -s -X POST localhost:3000/videos -H 'Content-Type: application/json' \
  -d '{"title":"test"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST localhost:3000/videos/$ID/updates -H 'Content-Type: application/json' -d '{"likes":33}'
curl -s -X POST localhost:3000/videos/$ID/updates -H 'Content-Type: application/json' -d '{"saves":55}'
curl -s localhost:3000/videos/$ID/updates   # two rows; non-supplied metrics are null
```

For UI changes, load http://localhost:5173 and exercise the desktop workflows
(Input, Videos, Reports) at a typical desktop viewport. Check that tables, forms,
and charts make good use of horizontal space without awkward wrapping.

To verify the **content updater** end-to-end (no publishing needed), follow the
"Testing update + rollback locally" recipe in
[`packages/desktop/docs/CONTENT_UPDATES.md`](packages/desktop/docs/CONTENT_UPDATES.md):
build the current content as the seed, build+pack a bumped `CONTENT_VERSION`,
`yarn content:serve`, and launch with `GREEDY_UPDATE_URL` pointed at it. Watch
`userData/logs/updater.log`.
