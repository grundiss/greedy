import { useEffect, useState } from 'react';
import { getGreedy, type UpdateStatus } from '../lib/greedy';

// A small, non-blocking toast that keeps the user informed about content
// updates. Updates apply automatically — this never asks the user to do
// anything; it only reports available / downloading / installed / rolled-back.
// Renders nothing in the browser dev app (no desktop bridge).

interface Notice {
  text: string;
  tone: 'info' | 'progress' | 'success' | 'error';
  progress?: number; // 0..1
  sticky?: boolean; // success/error auto-dismiss; progress stays
}

function toNotice(s: UpdateStatus): Notice | null {
  switch (s.phase) {
    case 'available':
      return { text: `Update ${s.version} available…`, tone: 'info' };
    case 'downloading': {
      const pct = s.totalBytes > 0 ? s.receivedBytes / s.totalBytes : undefined;
      return { text: `Downloading update ${s.version}`, tone: 'progress', progress: pct };
    }
    case 'verifying':
      return { text: `Verifying update ${s.version}…`, tone: 'progress' };
    case 'applying':
      return { text: `Installing update ${s.version}…`, tone: 'progress' };
    case 'installed':
      return { text: `Updated to ${s.version}`, tone: 'success' };
    case 'rolled-back':
      return {
        text: `Update failed — safely restored ${s.activeVersion ?? 'previous version'}`,
        tone: 'error',
      };
    case 'error':
      return { text: `Update error: ${s.error}`, tone: 'error' };
    // checking / up-to-date / idle: stay quiet.
    default:
      return null;
  }
}

const TONE: Record<Notice['tone'], string> = {
  info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  progress: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-amber-300 bg-amber-50 text-amber-900',
};

export function UpdateNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const greedy = getGreedy();
    if (!greedy) return;

    // The window created right after a successful update carries a one-time
    // confirmation flag (the live "installed" IPC may arrive before we subscribe).
    if (greedy.updatedTo) {
      setNotice({ text: `Updated to ${greedy.updatedTo}`, tone: 'success' });
    }

    return greedy.onUpdateStatus((s) => {
      const n = toNotice(s);
      if (n) setNotice(n);
    });
  }, []);

  // Auto-dismiss terminal (success/error) notices; keep progress visible.
  useEffect(() => {
    if (!notice || notice.tone === 'progress' || notice.tone === 'info') return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 w-72 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg ${TONE[notice.tone]}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {notice.tone === 'progress' && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        <span className="min-w-0 flex-1">{notice.text}</span>
      </div>
      {notice.tone === 'progress' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-200/60">
          <div
            className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
            style={{
              width: notice.progress != null ? `${Math.round(notice.progress * 100)}%` : '40%',
            }}
          />
        </div>
      )}
    </div>
  );
}
