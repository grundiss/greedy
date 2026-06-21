// Owns the single BrowserWindow. The window is (re)created rather than merely
// reloaded after an update so the preload picks up the new loopback API URL via
// additionalArguments. Security posture: contextIsolation on, nodeIntegration
// off, sandbox on, a narrow preload — the renderer can only reach the small
// surface exposed in preload.ts.
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs/promises';
import { APP_ORIGIN } from './config.js';

// preload.cjs is emitted next to the bundled main.js (see build.mjs).
const preloadPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs');

let current: BrowserWindow | null = null;

interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

const DEFAULT_BOUNDS: WindowBounds = {
  width: 1200,
  height: 800,
};

function getWindowBoundsPath(): string {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

async function loadWindowBounds(): Promise<WindowBounds> {
  try {
    const boundsPath = getWindowBoundsPath();
    const data = await fs.readFile(boundsPath, 'utf-8');
    const bounds = JSON.parse(data) as WindowBounds;
    // Validate that bounds are reasonable
    if (bounds.width > 300 && bounds.height > 300 && bounds.width < 4000 && bounds.height < 4000) {
      return bounds;
    }
  } catch {
    // File doesn't exist or is invalid, use defaults
  }
  return DEFAULT_BOUNDS;
}

async function saveWindowBounds(bounds: WindowBounds): Promise<void> {
  try {
    const boundsPath = getWindowBoundsPath();
    await fs.writeFile(boundsPath, JSON.stringify(bounds, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save window bounds:', err);
  }
}

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

export async function createWindow(ctx: WindowContext): Promise<BrowserWindow> {
  const bounds = await loadWindowBounds();
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    ...bounds,
    title: 'Greedy',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: buildArgs(ctx),
    },
  };

  const win = new BrowserWindow(windowOptions);

  // Save window bounds when resized or moved
  win.on('resized', () => {
    const newBounds = win.getBounds();
    void saveWindowBounds(newBounds);
  });

  win.on('moved', () => {
    const newBounds = win.getBounds();
    void saveWindowBounds(newBounds);
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
export async function recreateWindow(ctx: WindowContext): Promise<BrowserWindow> {
  const old = current;
  const next = await createWindow(ctx);
  if (old && !old.isDestroyed() && old !== next) old.destroy();
  return next;
}

export function hasWindow(): boolean {
  return BrowserWindow.getAllWindows().length > 0;
}
