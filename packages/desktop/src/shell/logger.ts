// Tiny append-only file logger for the updater, mirrored to the console. Kept
// dependency-free and synchronous so a log line is never lost to an unflushed
// async write when the app is mid-crash or mid-update. Rotates at ~1 MB.
import fs from 'node:fs';
import path from 'node:path';
import { logDir } from './paths.js';

const MAX_BYTES = 1_000_000;
let logFile: string | null = null;

function ensureFile(): string | null {
  if (logFile) return logFile;
  try {
    const dir = logDir();
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'updater.log');
    return logFile;
  } catch {
    return null; // logging must never throw into the update flow
  }
}

function rotateIfNeeded(file: string): void {
  try {
    const { size } = fs.statSync(file);
    if (size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
  } catch {
    // no file yet, or stat failed — nothing to rotate
  }
}

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : safe(a)))
    .join(' ')}\n`;
  const file = ensureFile();
  if (file) {
    try {
      rotateIfNeeded(file);
      fs.appendFileSync(file, line);
    } catch {
      // disk full / permissions — fall through to console only
    }
  }
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const log = {
  info(...args: unknown[]): void {
    console.log('[updater]', ...args);
    write('info', args);
  },
  warn(...args: unknown[]): void {
    console.warn('[updater]', ...args);
    write('warn', args);
  },
  error(...args: unknown[]): void {
    console.error('[updater]', ...args);
    write('error', args);
  },
};
