// Greedy desktop shell — a stable container for signed content bundles.
//
// The shell is intentionally thin and static: it boots the active content
// version, serves its frontend over app://, runs its backend, and manages
// content updates. It does NOT contain app features — those live in the content
// bundle (web build + backend code + migrations) and are updated independently
// via the content updater. See packages/desktop/docs/CONTENT_UPDATES.md.
import { app, dialog, ipcMain } from 'electron';
import {
  CONTENT_UPDATES_ENABLED,
  ENABLE_SHELL_AUTOUPDATE,
  INITIAL_CHECK_DELAY_MS,
} from './shell/config.js';
import * as store from './shell/content-store.js';
import { log } from './shell/logger.js';
import { installAppProtocol, registerAppScheme } from './shell/protocol.js';
import { Runtime } from './shell/runtime.js';
import type { UpdateStatus } from './shell/types.js';
import { Updater } from './shell/updater.js';
import { createWindow, getWindow, hasWindow, recreateWindow } from './shell/window.js';

// userData lands under ~/Library/Application Support/Greedy (not the scoped
// package name) so the DB + content live in a clean, stable location.
app.setName('Greedy');

// app:// must be registered as a privileged scheme before the app is ready.
registerAppScheme();

const runtime = new Runtime();
let updater: Updater | null = null;
let isQuitting = false;

function emit(status: UpdateStatus): void {
  log.info('status:', status.phase, 'version' in status ? (status.version ?? '') : '');
  getWindow()?.webContents.send('greedy:update-status', status);
}

function windowContext(updatedTo?: string) {
  return {
    apiUrl: runtime.apiUrl ?? '',
    appVersion: app.getVersion(),
    contentVersion: store.activeVersion() ?? 'unknown',
    updatedTo,
  };
}

// Boot the runtime on the active version, recovering by rolling back through
// known-good versions (and finally the seed) if a version won't start. This is
// the launch-time counterpart to the updater's rollback.
async function bootWithRecovery(): Promise<void> {
  store.ensureSeeded();
  const tried = new Set<string>();

  for (;;) {
    const version = store.activeVersion();
    const paths = version ? store.activePaths() : null;
    if (!version || !paths) {
      store.ensureSeeded();
      const seeded = store.activePaths();
      if (!seeded) throw new Error('no usable content version (seed missing or corrupt)');
      await runtime.start(seeded);
      return;
    }
    if (tried.has(version)) throw new Error(`content ${version} failed and no fallback booted`);
    tried.add(version);

    try {
      await runtime.start(paths);
      store.markKnownGood(version);
      return;
    } catch (err) {
      log.error(`content ${version} failed to boot, recovering:`, err);
      await runtime.stop().catch(() => undefined);
      store.markBad(version);
      const fallback = store.rollbackTarget(version);
      if (fallback) store.switchTo(fallback);
      else store.ensureSeeded();
    }
  }
}

function setupShellAutoUpdate(): void {
  // Separate, infrequent channel for updating the Electron binary itself (rare;
  // a no-op until the app is signed + notarized). Off by default so it never
  // competes with content updates.
  if (!ENABLE_SHELL_AUTOUPDATE || !app.isPackaged) return;
  void import('electron-updater').then(({ default: eu }) => {
    eu.autoUpdater.on('error', (err) => log.error('shell autoUpdater error:', err));
    eu.autoUpdater.checkForUpdatesAndNotify().catch((err) => log.error('shell update check:', err));
  });
}

async function start(): Promise<void> {
  // Serve the active version's frontend over app://. The getter is evaluated per
  // request, so after an in-process update the new web root is served instantly.
  installAppProtocol(() => store.activePaths()?.web ?? null);

  await bootWithRecovery();
  await createWindow(windowContext());

  // Manual "check now" from the renderer (updates are automatic regardless).
  ipcMain.handle('greedy:check-for-updates', async () => {
    await updater?.checkAndApply();
  });

  updater = new Updater({
    runtime,
    appVersion: app.getVersion(),
    emit,
    recreateWindow: async (updatedTo) => void (await recreateWindow(windowContext(updatedTo))),
  });

  if (CONTENT_UPDATES_ENABLED) {
    setTimeout(() => updater?.start(), INITIAL_CHECK_DELAY_MS);
  }
  setupShellAutoUpdate();
}

app.whenReady().then(
  () => {
    start().catch((err) => {
      log.error('Failed to start Greedy:', err);
      dialog.showErrorBox('Greedy failed to start', String(err?.stack ?? err));
      app.quit();
    });

    app.on('activate', () => {
      // macOS: re-open a window when the dock icon is clicked and none are open.
      if (!hasWindow() && runtime.apiUrl) void createWindow(windowContext());
    });
  },
  (err) => log.error('app failed to become ready:', err),
);

app.on('window-all-closed', () => app.quit());

// Flush the embedded DB before exiting. before-quit doesn't await async
// handlers, so prevent the first quit, tear the runtime down, then quit.
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  updater?.stop();
  runtime
    .stop()
    .catch((err) => log.error('error stopping runtime:', err))
    .finally(() => app.quit());
});
