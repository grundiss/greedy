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
  shared/   @greedy/shared  — types shared by api + web (built to dist)
  api/      @greedy/api      — Fastify server + Drizzle schema/migrations
  web/      @greedy/web      — React + Vite + Tailwind frontend
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

## Notes

- **Formatting**: a Husky `pre-commit` hook runs `lint-staged` (Prettier) on staged files.
- **Docker Compose**: local dev only. In production each service is deployed separately.
