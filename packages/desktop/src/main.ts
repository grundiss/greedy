import { createPgliteDb } from '@greedy/api/db/pglite';
import { startServer } from '@greedy/api/server';
import { app, BrowserWindow, dialog, shell } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// electron-updater is CJS; from an ESM main process use the default import.
const { autoUpdater } = electronUpdater;

// Without this, userData lands under the scoped package name
// (~/Library/Application Support/@greedy/desktop). Pin a clean name so the DB
// and app data live under ~/Library/Application Support/Greedy.
app.setName('Greedy');

// Note: `__dirname`/`__filename` are provided to bundled CJS deps by the
// esbuild banner (build.mjs), so we use a distinct name here to avoid a clash.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let serverUrl: string | null = null;
let closeDb: (() => Promise<void>) | null = null;
let isQuitting = false;

// Where the SPA build and the SQL migrations live. Packaged: shipped via
// electron-builder `extraResources` → process.resourcesPath. Dev: in the repo.
function resolveResources(): { webRoot: string; migrationsFolder: string } {
  if (app.isPackaged) {
    return {
      webRoot: path.join(process.resourcesPath, 'web'),
      migrationsFolder: path.join(process.resourcesPath, 'drizzle'),
    };
  }
  // dev: packages/desktop/dist/main.js → repo root is three levels up.
  const repoRoot = path.resolve(moduleDir, '..', '..', '..');
  return {
    webRoot: path.join(repoRoot, 'packages', 'web', 'dist'),
    migrationsFolder: path.join(repoRoot, 'packages', 'api', 'drizzle'),
  };
}

function createWindow(url: string): void {
  const win = new BrowserWindow({
    width: 460,
    height: 900,
    title: 'Greedy',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank / external links in the user's browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  void win.loadURL(url);
}

// Wires auto-update against GitHub Releases. NOTE: on macOS this is a no-op
// until the app is code-signed + notarized — Squirrel.Mac refuses to apply an
// unsigned update. Once signing secrets are added (see electron-builder.yml),
// this starts working with no code change.
function setupAutoUpdates(): void {
  autoUpdater.on('update-downloaded', () => {
    void dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: 'A new version of Greedy is ready.',
        detail: 'Restart to install the update.',
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err);
  });
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[updater] check failed:', err);
  });
}

async function start(): Promise<void> {
  const { webRoot, migrationsFolder } = resolveResources();
  const dataDir = path.join(app.getPath('userData'), 'greedy-db');

  // 1) Embedded DB (creates the data dir + runs migrations) before serving.
  const { db, close } = await createPgliteDb(dataDir, migrationsFolder);
  closeDb = close;

  // 2) Embedded API + SPA on a loopback ephemeral port (same origin → no CORS).
  const { url } = await startServer({
    db,
    host: '127.0.0.1',
    port: 0,
    serveWebRoot: webRoot,
    logger: false,
  });
  serverUrl = url;

  // 3) Window (only after the server is listening — no port race).
  createWindow(url);

  if (app.isPackaged) setupAutoUpdates();
}

app.whenReady().then(
  () => {
    start().catch((err) => {
      console.error('Failed to start Greedy:', err);
      dialog.showErrorBox('Greedy failed to start', String(err?.stack ?? err));
      app.quit();
    });

    app.on('activate', () => {
      // macOS: re-open a window when the dock icon is clicked and none are open.
      if (BrowserWindow.getAllWindows().length === 0 && serverUrl) createWindow(serverUrl);
    });
  },
  (err) => {
    console.error('app failed to become ready:', err);
  },
);

app.on('window-all-closed', () => {
  app.quit();
});

// Flush PGlite to disk before exiting. before-quit doesn't await async handlers,
// so prevent the first quit, close the db, then quit for real.
app.on('before-quit', (event) => {
  if (isQuitting || !closeDb) return;
  event.preventDefault();
  isQuitting = true;
  closeDb()
    .catch((err) => console.error('error closing db:', err))
    .finally(() => app.quit());
});
