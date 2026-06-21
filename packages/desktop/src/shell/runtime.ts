// The internal runtime: the embedded PGlite database (owned by the shell, so it
// persists across content updates) plus the backend server, whose CODE comes
// from the active content bundle and is loaded dynamically. This is the only
// place the shell executes bundle-provided code — and only after that bundle has
// been verified and accepted into content/<version> by the updater.
//
// The DB driver + migrator live in the SHELL (stable infra). The migration SQL
// files come from the bundle (updatable). So a content update can add migrations
// without shipping a new shell, while the shell controls HOW they run.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN } from './config.js';
import { log } from './logger.js';
import { dbBackupDir, dbDir } from './paths.js';

// The contract every content bundle's server entry must satisfy. The shell
// injects the db + chooses the port; the bundle builds + listens and hands back
// the bound URL and a close handle.
type ServerStart = (opts: {
  db: unknown;
  host: string;
  port: number;
  corsOrigin: string;
  logger?: boolean;
}) => Promise<{ url: string; port: number; close: () => Promise<void> }>;

type PgliteClient = InstanceType<typeof PGlite>;

export class Runtime {
  private client: PgliteClient | null = null;
  private db: ReturnType<typeof drizzle> | null = null;
  private server: { url: string; close: () => Promise<void> } | null = null;

  // The loopback URL the renderer talks to. Changes whenever the backend is
  // (re)started, which is why the renderer reads it fresh on each window load.
  get apiUrl(): string | null {
    return this.server?.url ?? null;
  }

  async openDb(): Promise<void> {
    if (this.client) return;
    this.client = new PGlite(dbDir());
    this.db = drizzle(this.client);
    log.info('database opened at', dbDir());
  }

  async closeDb(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    this.db = null;
    log.info('database closed (flushed to disk)');
  }

  // Applies any pending migrations from a bundle's drizzle folder. Idempotent:
  // drizzle records applied migrations, so re-running (e.g. after a rollback to
  // an already-migrated version) is a no-op.
  async migrate(migrationsFolder: string): Promise<void> {
    if (!this.db) throw new Error('migrate() called before openDb()');
    log.info('running migrations from', migrationsFolder);
    await migrate(this.db, { migrationsFolder });
    log.info('migrations up to date');
  }

  // Loads and starts the backend from a verified bundle's server entry. The path
  // is per-version, so the ESM module cache never serves stale code.
  async startServer(serverEntryPath: string): Promise<void> {
    if (!this.db) throw new Error('startServer() called before openDb()');
    if (this.server) await this.stopServer();
    const mod = (await import(pathToFileURL(serverEntryPath).href)) as { start?: ServerStart };
    if (typeof mod.start !== 'function') {
      throw new Error(`backend entry ${serverEntryPath} does not export start()`);
    }
    this.server = await mod.start({
      db: this.db,
      host: '127.0.0.1',
      port: 0, // OS-assigned loopback port
      corsOrigin: APP_ORIGIN,
      logger: false,
    });
    log.info('backend started at', this.server.url);
  }

  async stopServer(): Promise<void> {
    if (!this.server) return;
    try {
      await this.server.close();
    } catch (err) {
      log.warn('error closing backend (continuing):', err);
    }
    this.server = null;
  }

  // Full boot from a set of active-bundle paths.
  async start(paths: { server: string; migrations: string }): Promise<void> {
    await this.openDb();
    await this.migrate(paths.migrations);
    await this.startServer(paths.server);
  }

  // Full teardown for app quit (flushes the DB).
  async stop(): Promise<void> {
    await this.stopServer();
    await this.closeDb();
  }

  // --- DB snapshot/restore, used to make a content apply atomic w.r.t. the DB.
  // A failed migration must not leave the user on new schema with old code, so
  // we snapshot before migrating and restore on any failure. The DB MUST be
  // closed (flushed, unlocked) when these run.
  snapshotDb(): void {
    fs.rmSync(dbBackupDir(), { recursive: true, force: true });
    if (fs.existsSync(dbDir())) {
      fs.cpSync(dbDir(), dbBackupDir(), { recursive: true });
      log.info('database snapshot taken');
    }
  }

  restoreDb(): void {
    if (!fs.existsSync(dbBackupDir())) {
      log.warn('no database snapshot to restore');
      return;
    }
    fs.rmSync(dbDir(), { recursive: true, force: true });
    fs.cpSync(dbBackupDir(), dbDir(), { recursive: true });
    log.info('database restored from snapshot');
  }

  clearSnapshot(): void {
    fs.rmSync(dbBackupDir(), { recursive: true, force: true });
  }
}
