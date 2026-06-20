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
end user. The Electron main process (`@greedy/desktop`) **embeds the Fastify server
in-process**, which serves both the API and the built SPA from one loopback origin, and
swaps PostgreSQL for **PGlite** (embedded WASM Postgres) stored under the app's
`userData` directory. The existing schema and Drizzle migrations run unchanged.

```bash
yarn desktop:dev    # build shared/api/web (same-origin) + launch the Electron app
yarn desktop:dist   # build a .dmg + .zip locally (release/ dir), unsigned
```

- **Dev stays a web app.** `yarn dev` (Docker + Postgres + Vite) is unchanged. The
  desktop build is a separate target; the API supports both DB drivers via an injected
  connection (`createPostgresDb` / `createPgliteDb`).
- **Releases & auto-update.** Pushing a `v*` tag runs
  [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds on
  `macos-latest` and publishes `.dmg`, `.zip`, and `latest-mac.yml` to a GitHub Release.
  The app checks that feed via `electron-updater` on launch.
- ⚠️ **Code signing is off for now.** Until the app is signed + notarized with an Apple
  Developer ID, users must right-click → **Open** past Gatekeeper on first launch, and
  **macOS auto-update will not apply** (the update downloads but Squirrel.Mac refuses it).
  To enable: add the signing secrets in CI and flip `identity`/`notarize` in
  [`packages/desktop/electron-builder.yml`](packages/desktop/electron-builder.yml) — no
  other code changes needed.

## Notes

- **Formatting**: a Husky `pre-commit` hook runs `lint-staged` (Prettier) on staged files.
- **Docker Compose**: local dev only (for the web app). The desktop build uses PGlite.
