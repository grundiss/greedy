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

## Stack & layout

TypeScript monorepo (Yarn workspaces). Three packages under `packages/`:

| Package    | Name              | Role                                                        |
| ---------- | ----------------- | ----------------------------------------------------------- |
| `shared/`  | `@greedy/shared`  | DTOs/types shared by api + web. Built to `dist/` (watched). |
| `api/`     | `@greedy/api`     | Fastify server + Drizzle schema/migrations.                 |
| `web/`     | `@greedy/web`     | React 19 + Vite + Tailwind v4 frontend.                     |
| `desktop/` | `@greedy/desktop` | Electron wrapper → auto-updating macOS app.                 |

Dev runs in Docker Compose (postgres + shared + api + web) with hot reload. The
**desktop build** is a separate target: Electron embeds the Fastify server and
serves the SPA from one loopback origin, swapping Postgres for **PGlite**
(embedded WASM Postgres) under the app's `userData`. See `README.md` for both.

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

## Core domain model

Two tables in [`packages/api/src/db/schema.ts`](packages/api/src/db/schema.ts):

- **`videos`** — the content. Has descriptive fields (`title`, `description`,
  `durationSeconds`, `tags`) plus **editorial attributes** used for analysis:
  `publishedAt`, `hasFace`, `hookType` (`'none' | 'question' | 'result'`),
  `soundType` (`'music' | 'voice'`), `subtitles`. Enum-like columns are stored as
  `text` in the DB; the allowed values live as union types in shared
  (`HookType`, `SoundType`) and are validated server-side.
- **`updates`** — timestamped metric snapshots. **Every metric column
  (`likes`, `saves`, `depthPct`) is nullable.** This is the central design
  decision: an update carries only the metric(s) the user entered at that moment
  (e.g. just `likes`). Reports plot each metric using only the rows where it is
  non-null. `recordedAt` defaults to now but can be backdated.

> When adding a new metric: add a nullable column to `updates`, the field to the
> `Update`/`NewUpdateInput` DTOs, one input in the Log Update form, and one
> entry in the `METRICS` array in `ReportsPage.tsx`. When adding a new video
> attribute: column on `videos`, field on `Video`/`NewVideoInput`, a serializer
> line + validation in the API, and an input in the Add Video form.

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
  and the typed fetch client in [`src/lib/api.ts`](packages/web/src/lib/api.ts).

## HTTP API

Base URL `http://localhost:3000`. JSON in/out. Errors are
`{ error, message }` with an appropriate status.

| Method | Path                  | Notes                                                             |
| ------ | --------------------- | ----------------------------------------------------------------- |
| GET    | `/videos`             | List, newest first.                                               |
| POST   | `/videos`             | Create. Requires non-empty `title`.                               |
| GET    | `/videos/:id`         | Returns `VideoWithUpdates` (video + full time series).            |
| DELETE | `/videos/:id`         | Cascades to its updates.                                          |
| POST   | `/videos/:id/updates` | Partial update. **Requires ≥1 metric**; `depthPct` clamped 0–100. |
| GET    | `/videos/:id/updates` | Updates oldest-first.                                             |

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
