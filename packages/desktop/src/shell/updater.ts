// Orchestrates content updates. Two phases, deliberately separated so a failure
// can never leave the app broken:
//
//   ACQUIRE (safe): check manifest → download → verify hash → extract → validate
//     → promote into content/<version>. The running app is untouched throughout;
//     any failure just cleans .staging and the user keeps the current version.
//
//   ACTIVATE (reversible): stop runtime → snapshot DB → atomically switch active
//     → migrate → restart backend → re-create window. Any failure triggers
//     rollback: restore the DB snapshot, switch back to the last known-good
//     version, restart it, and mark the failed version bad so it's never retried.
import fs from 'node:fs';
import path from 'node:path';
import { CHECK_INTERVAL_MS, UPDATE_FEED_URL } from './config.js';
import * as store from './content-store.js';
import { downloadArchive, extractTarGz, fetchManifest } from './download.js';
import { log } from './logger.js';
import { stagingDir, versionDir } from './paths.js';
import type { Runtime } from './runtime.js';
import { isNewer, satisfiesMinShellVersion } from './semver.js';
import type { UpdateStatus } from './types.js';
import { hashesMatch, sha256File } from './verify.js';

export interface UpdaterDeps {
  runtime: Runtime;
  appVersion: string;
  // Push a status to the renderer (and log it).
  emit: (status: UpdateStatus) => void;
  // Rebuild the window after the active bundle/API URL changes. `updatedTo` set
  // on a successful update so the UI can show a one-time confirmation.
  recreateWindow: (updatedTo?: string) => Promise<void>;
}

export class Updater {
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: UpdaterDeps) {}

  start(): void {
    if (this.timer) return;
    void this.checkAndApply();
    this.timer = setInterval(() => void this.checkAndApply(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Public entry point. Never throws — failures are reported via emit() and the
  // app is always left in a runnable state.
  async checkAndApply(): Promise<void> {
    if (this.busy) {
      log.info('update check skipped (already running)');
      return;
    }
    this.busy = true;
    try {
      await this.run();
    } catch (err) {
      log.error('update check failed:', err);
      this.deps.emit({ phase: 'error', error: String((err as Error)?.message ?? err) });
    } finally {
      this.busy = false;
    }
  }

  private async run(): Promise<void> {
    const { emit, appVersion } = this.deps;
    emit({ phase: 'checking' });

    const active = store.activeVersion();
    const { manifest, baseUrl } = await fetchManifest(UPDATE_FEED_URL);
    const target = manifest.version;

    // Already current, or older, or a version we've already tried and rejected.
    if (!active || !isNewer(target, active)) {
      emit({ phase: 'up-to-date', version: active ?? target });
      return;
    }
    if (store.readState().bad.includes(target)) {
      log.warn(`skipping version ${target} — previously failed`);
      emit({ phase: 'up-to-date', version: active });
      return;
    }
    // The bundle may require a newer shell than is installed.
    if (!satisfiesMinShellVersion(appVersion, manifest.minShellVersion)) {
      const msg = `content ${target} needs shell >= ${manifest.minShellVersion} (have ${appVersion})`;
      log.warn(msg);
      emit({ phase: 'error', version: target, error: msg });
      return;
    }

    emit({ phase: 'available', version: target, notes: manifest.notes });

    // --- ACQUIRE -------------------------------------------------------------
    const staging = stagingDir();
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    const archivePath = path.join(staging, `${target}.tar.gz`);
    const extractDir = path.join(staging, `${target}.extract`);

    emit({
      phase: 'downloading',
      version: target,
      receivedBytes: 0,
      totalBytes: manifest.archive.size,
    });
    await downloadArchive(manifest, baseUrl, archivePath, (receivedBytes, totalBytes) =>
      emit({ phase: 'downloading', version: target, receivedBytes, totalBytes }),
    );

    emit({ phase: 'verifying', version: target });
    const digest = await sha256File(archivePath);
    if (!hashesMatch(digest, manifest.archive.sha256)) {
      throw new Error(`archive hash mismatch: got ${digest}, expected ${manifest.archive.sha256}`);
    }

    await extractTarGz(archivePath, extractDir);
    const meta = store.validateBundleDir(extractDir);
    if (!meta) throw new Error('extracted bundle failed validation');
    if (meta.version !== target) {
      throw new Error(`bundle declares ${meta.version} but manifest says ${target}`);
    }

    // Promote into the version store (atomic rename on the same filesystem).
    const dest = versionDir(target);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(extractDir, dest);
    fs.rmSync(staging, { recursive: true, force: true });
    if (!store.readBundleMeta(target)) throw new Error('promoted bundle failed validation');
    log.info(`acquired content version ${target}`);

    // --- ACTIVATE ------------------------------------------------------------
    await this.activate(target, active);
  }

  // Switches the runtime onto `target`, rolling back to `fallback` (or the best
  // known-good version) if anything goes wrong.
  private async activate(target: string, fallback: string | null): Promise<void> {
    const { runtime, emit, recreateWindow } = this.deps;
    emit({ phase: 'applying', version: target });

    await runtime.stopServer();
    await runtime.closeDb();
    runtime.snapshotDb();

    try {
      store.switchTo(target);
      const paths = store.activePaths();
      if (!paths) throw new Error('active paths unavailable after switch');
      await runtime.openDb();
      await runtime.migrate(paths.migrations);
      await runtime.startServer(paths.server);

      // Success: lock it in.
      store.markKnownGood(target);
      runtime.clearSnapshot();
      store.prune();
      await recreateWindow(target);
      emit({ phase: 'installed', version: target });
      log.info(`installed content version ${target}`);
    } catch (err) {
      log.error(`activation of ${target} failed, rolling back:`, err);
      await this.rollback(target, fallback, String((err as Error)?.message ?? err));
    }
  }

  private async rollback(failed: string, fallback: string | null, error: string): Promise<void> {
    const { runtime, emit, recreateWindow } = this.deps;
    // Tear down whatever half-started, undo the DB migration, blacklist the bad
    // version, and choose the safest target to bring back up.
    await runtime.stop().catch(() => undefined);
    runtime.restoreDb();
    store.markBad(failed);

    const targetVersion =
      fallback && store.isUsable(fallback) && fallback !== failed
        ? fallback
        : store.rollbackTarget(failed);

    try {
      if (!targetVersion) {
        // Nothing usable left on disk — re-seed from the shipped bundle.
        store.ensureSeeded();
      } else {
        store.switchTo(targetVersion);
      }
      const paths = store.activePaths();
      if (!paths) throw new Error('no usable content to roll back to');
      await runtime.openDb();
      await runtime.migrate(paths.migrations);
      await runtime.startServer(paths.server);
      runtime.clearSnapshot();
      await recreateWindow();
      emit({
        phase: 'rolled-back',
        failedVersion: failed,
        activeVersion: store.activeVersion(),
        error,
      });
      log.info(`rolled back to ${store.activeVersion()} after ${failed} failed`);
    } catch (rollbackErr) {
      // Worst case: even the fallback won't boot. Surface loudly; the app likely
      // needs a manual restart, but the DB snapshot has been restored.
      log.error('ROLLBACK FAILED — runtime is down:', rollbackErr);
      emit({
        phase: 'error',
        version: failed,
        error: `update failed and rollback failed: ${String(rollbackErr)}`,
      });
    }
  }
}
