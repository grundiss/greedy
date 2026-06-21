# Greedy

Monorepo web app: Fastify backend + React frontend, sharing TypeScript types.

## Stack

| Area     | Tech                                           |
| -------- | ---------------------------------------------- |
| Language | TypeScript                                     |
| Backend  | Fastify (monolith)                             |
| Database | PostgreSQL + Drizzle ORM / drizzle-kit         |
| Frontend | React 19, Vite, Tailwind CSS v4                |
| Tooling  | Yarn workspaces, Prettier (+ Husky pre-commit) |

## Layout

```
packages/
  shared/   @greedy/shared   — types shared by api + web (built to dist)
  api/      @greedy/api       — Fastify server + Drizzle schema/migrations
  web/      @greedy/web       — React + Vite + Tailwind frontend
  desktop/  @greedy/desktop   — Electron wrapper (macOS app, auto-updating)
```

## Getting started

```bash
yarn install                  # for the Husky hook + host-side db tooling
cp .env.example .env          # single env file at the repo root
yarn dev                      # docker compose up: postgres + shared + api + web
```

Then, in another terminal, apply the schema:

```bash
yarn db:generate              # generate SQL migration from the schema
yarn db:migrate               # apply migrations (talks to Postgres on :5432)
```

- API: http://localhost:3000 (try `GET /health`)
- Web: http://localhost:5173

Everything runs in Docker Compose with hot reload — edit files under `packages/`
and the api restarts / the web HMRs automatically.

## Scripts (run from the repo root)

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `yarn dev`          | `docker compose up` — postgres + shared + api + web |
| `yarn dev:build`    | Same, rebuilding images first (after dep changes)   |
| `yarn down`         | Stop and remove the Compose stack                   |
| `yarn logs`         | Follow logs from all services                       |
| `yarn build`        | Build shared, api, and web (for production)         |
| `yarn typecheck`    | Typecheck every workspace                           |
| `yarn format`       | Format the repo with Prettier                       |
| `yarn format:check` | Check formatting (CI-friendly)                      |
| `yarn db:generate`  | Generate a Drizzle migration from the schema        |
| `yarn db:migrate`   | Apply pending migrations                            |
| `yarn db:push`      | Push schema directly (no migration file)            |
| `yarn db:studio`    | Open Drizzle Studio                                 |

The `db:*` scripts run on the host against the Compose Postgres (port `5432` is
published), so the stack needs to be `up` first.

## How dev mode works

- **Services**: `docker-compose.yml` runs four containers — `postgres`, `shared`
  (compiles `@greedy/shared` in watch mode), `api` (Fastify via `tsx watch`), and
  `web` (Vite dev server). `api`/`web` wait for `shared` to produce its `dist` and
  for Postgres to be healthy.
- **Hot reload**: the repo is bind-mounted into the containers; `node_modules` are
  masked with anonymous volumes so the Linux deps from the image are used (not your
  host's). File watching uses polling (`CHOKIDAR_USEPOLLING`) for reliability on
  macOS/Windows.
- **Env**: one `.env` at the repo root. Compose overrides `DATABASE_URL` to point at
  the `postgres` service; the browser reaches the API via the published port.

## Desktop app (macOS)

Greedy ships as a downloadable macOS app — no Docker, no Postgres, no setup for the
end user. `@greedy/desktop` is a **static Electron shell** that runs **signed content
bundles**: it serves the SPA over a custom `app://` protocol, loads the backend from
the active bundle, runs it on a loopback port, and swaps PostgreSQL for **PGlite**
(embedded WASM Postgres) under the app's `userData`. The existing schema and Drizzle
migrations run unchanged.

Most updates ship as **content** (frontend + backend + migrations), verified by
SHA-256 + an ed25519 signature and applied automatically — no new app binary, no
code signing, no server. The full design, release workflow, and local test recipe
live in [`packages/desktop/docs/CONTENT_UPDATES.md`](packages/desktop/docs/CONTENT_UPDATES.md).

```bash
yarn gen:keys       # one-time: generate the content-signing keypair
yarn desktop:dev    # build the shell + seed content bundle, launch Electron
yarn desktop:dist   # package the static shell as .dmg + .zip (release/), unsigned
yarn content:release  # build + sign + publish a content update (the common path)
```

- **Dev stays a web app.** `yarn dev` (Docker + Postgres + Vite) is unchanged. The
  desktop build is a separate target; the API supports both DB drivers via an injected
  connection (`createPostgresDb` / `createPgliteDb`).
- **Content updates (primary).** A signed `manifest.json` + archive on a static feed
  (default: a fixed `content-latest` GitHub Release). The app checks it, verifies the
  signature + hash, applies in-process, and **rolls back** to the last known-good
  version if anything fails.
- **Shell binary updates (rare).** Pushing a `v*` tag runs
  [`.github/workflows/release.yml`](.github/workflows/release.yml) to publish the
  `.app`. A separate `electron-updater` channel exists but is off by default
  (`GREEDY_SHELL_AUTOUPDATE=1`) and is a no-op until the app is signed + notarized.
- ⚠️ **Code signing is off for now.** Until the app is signed + notarized with an Apple
  Developer ID, users must right-click → **Open** past Gatekeeper on first launch.
  Content updates do **not** depend on Apple signing — they use the app's own ed25519
  signature, so auto-update works regardless. To enable shell auto-update later, add the
  signing secrets in CI and flip `identity`/`notarize` in
  [`packages/desktop/electron-builder.yml`](packages/desktop/electron-builder.yml).

## Notes

- **Formatting**: a Husky `pre-commit` hook runs `lint-staged` (Prettier) on staged files.
- **Docker Compose**: local dev only (for the web app). The desktop build uses PGlite.
