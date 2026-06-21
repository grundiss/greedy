// Owns the single BrowserWindow. The window is (re)created rather than merely
// reloaded after an update so the preload picks up the new loopback API URL via
// additionalArguments. Security posture: contextIsolation on, nodeIntegration
// off, sandbox on, a narrow preload — the renderer can only reach the small
// surface exposed in preload.ts.
import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ORIGIN } from './config.js';

// preload.cjs is emitted next to the bundled main.js (see build.mjs).
const preloadPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs');

let current: BrowserWindow | null = null;

export interface WindowContext {
  apiUrl: string;
  appVersion: string;
  contentVersion: string;
  // Set immediately after a successful in-process update so the renderer can
  // show a one-time "Updated to vX" confirmation on the fresh window.
  updatedTo?: string;
}

function buildArgs(ctx: WindowContext): string[] {
  const args = [
    `--greedy-api-url=${ctx.apiUrl}`,
    `--greedy-app-version=${ctx.appVersion}`,
    `--greedy-content-version=${ctx.contentVersion}`,
  ];
  if (ctx.updatedTo) args.push(`--greedy-updated-to=${ctx.updatedTo}`);
  return args;
}

export function createWindow(ctx: WindowContext): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 900,
    title: 'Greedy',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: buildArgs(ctx),
    },
  });

  // External links open in the user's browser, never a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    if (current === win) current = null;
  });

  void win.loadURL(`${APP_ORIGIN}/`);
  current = win;
  return win;
}

export function getWindow(): BrowserWindow | null {
  return current && !current.isDestroyed() ? current : null;
}

// Replace the live window with a fresh one (new preload args, fresh load of the
// active content). Used after an update or rollback so the renderer reflects the
// new bundle + API URL without any manual action.
export function recreateWindow(ctx: WindowContext): BrowserWindow {
  const old = current;
  const next = createWindow(ctx);
  if (old && !old.isDestroyed() && old !== next) old.destroy();
  return next;
}

export function hasWindow(): boolean {
  return BrowserWindow.getAllWindows().length > 0;
}
