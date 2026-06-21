// Typed accessor for the desktop shell bridge exposed by the Electron preload as
// `window.greedy`. Absent in the browser dev app — callers must handle undefined.

// Mirrors src/shell/types.ts UpdateStatus in @greedy/desktop. Kept as a local
// copy because web cannot import from the desktop package.
export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date'; version: string }
  | { phase: 'available'; version: string; notes?: string }
  | { phase: 'downloading'; version: string; receivedBytes: number; totalBytes: number }
  | { phase: 'verifying'; version: string }
  | { phase: 'applying'; version: string }
  | { phase: 'installed'; version: string }
  | { phase: 'rolled-back'; failedVersion: string; activeVersion: string | null; error: string }
  | { phase: 'error'; error: string; version?: string };

export interface GreedyBridge {
  apiBaseUrl: string;
  appVersion: string;
  contentVersion: string;
  updatedTo: string | null;
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
  checkForUpdates(): Promise<void>;
}

declare global {
  interface Window {
    greedy?: GreedyBridge;
  }
}

export function getGreedy(): GreedyBridge | undefined {
  return typeof window !== 'undefined' ? window.greedy : undefined;
}
