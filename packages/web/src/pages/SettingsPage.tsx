import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import { api } from '../lib/api';
import { getGreedy, type UpdateStatus, type UpdateStatusLogEntry } from '../lib/greedy';

function Banner({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <div
      className={`rounded-xl px-4 py-2 text-sm ${
        kind === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {text}
    </div>
  );
}

function describeStatus(status: UpdateStatus): string {
  switch (status.phase) {
    case 'idle':
      return 'Idle';
    case 'checking':
      return 'Checking for content updates…';
    case 'up-to-date':
      return `No newer content found. Current version: ${status.version}`;
    case 'available':
      return `Found content update ${status.version}${status.notes ? ` — ${status.notes}` : ''}`;
    case 'downloading': {
      const pct =
        status.totalBytes > 0
          ? ` (${Math.round((status.receivedBytes / status.totalBytes) * 100)}%)`
          : '';
      return `Downloading content package ${status.version}: ${status.receivedBytes.toLocaleString()} / ${status.totalBytes.toLocaleString()} bytes${pct}`;
    }
    case 'verifying':
      return `Verifying content package ${status.version}…`;
    case 'applying':
      return `Installing content update ${status.version}…`;
    case 'installed':
      return `Installed content update ${status.version}`;
    case 'rolled-back':
      return `Update ${status.failedVersion} failed; rolled back to ${status.activeVersion ?? 'previous content'} (${status.error})`;
    case 'error':
      return `Update error${status.version ? ` for ${status.version}` : ''}: ${status.error}`;
  }
}

function statusTone(status: UpdateStatus): string {
  switch (status.phase) {
    case 'error':
    case 'rolled-back':
      return 'text-amber-300';
    case 'installed':
      return 'text-emerald-300';
    case 'downloading':
    case 'verifying':
    case 'applying':
      return 'text-indigo-300';
    default:
      return 'text-slate-200';
  }
}

export function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [updateLog, setUpdateLog] = useState<UpdateStatusLogEntry[]>([]);
  const greedy = getGreedy();

  useEffect(() => {
    const desktop = getGreedy();
    if (!desktop) return;

    let mounted = true;
    void desktop.getUpdateStatusLog().then((entries) => {
      if (mounted) setUpdateLog(entries);
    });

    const unsubscribe = desktop.onUpdateStatus((status) => {
      setUpdateLog((entries) => [...entries, { at: new Date().toISOString(), status }].slice(-200));
      if (status.phase === 'up-to-date') {
        setUpdateMsg({ kind: 'ok', text: `Content is up to date (${status.version}).` });
      } else if (status.phase === 'installed') {
        setUpdateMsg({ kind: 'ok', text: `Installed content update ${status.version}.` });
      } else if (status.phase === 'error') {
        setUpdateMsg({ kind: 'err', text: status.error });
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function checkForUpdates() {
    setUpdateMsg(null);
    setCheckingUpdates(true);
    try {
      const desktop = getGreedy();
      if (!desktop) throw new Error('Content updates are only available in the desktop app.');
      await desktop.checkForUpdates();
    } catch (err) {
      setUpdateMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Update check failed',
      });
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function exportDb() {
    setMsg(null);
    setBusy(true);
    try {
      const dump = await api.exportDb();
      const blob = new Blob([dump], { type: 'application/sql;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `greedy-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMsg({ kind: 'ok', text: 'Database export downloaded ✓' });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setBusy(false);
    }
  }

  async function importDb(file: File | undefined) {
    if (!file) return;
    const confirmed = window.confirm(
      'Importing replaces every saved video, update, and global update. Continue?',
    );
    if (!confirmed) return;

    setMsg(null);
    setBusy(true);
    try {
      const result = await api.importDb(await file.text());
      setMsg({
        kind: 'ok',
        text: `Imported ${result.imported.videos} videos, ${result.imported.updates} updates, ${result.imported.globalUpdates} global updates, and ${result.imported.promotions} promotions ✓`,
      });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="mt-1 text-slate-500">Back up or restore the complete Greedy database.</p>
      </div>

      <Card title="Import / export database">
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">Export SQL dump</h3>
            <p className="mt-2 min-h-12 text-sm text-slate-500">
              Download a SQL file containing all videos, metric updates, and global updates.
            </p>
            <Button type="button" disabled={busy} onClick={exportDb}>
              {busy ? 'Working…' : 'Download SQL dump'}
            </Button>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-950">Import SQL dump</h3>
            <p className="mt-2 min-h-12 text-sm text-amber-800">
              Restore a Greedy SQL export. This replaces the current local database.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql,application/sql,text/plain"
              className="hidden"
              onChange={(e) => void importDb(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? 'Working…' : 'Choose SQL dump…'}
            </Button>
          </div>
        </div>

        {msg ? (
          <div className="mt-5">
            <Banner kind={msg.kind} text={msg.text} />
          </div>
        ) : null}
      </Card>

      <Card title="Content updates">
        <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">Check for update</h3>
            <p className="mt-2 text-sm text-slate-500">
              Force the desktop shell to look for a signed content update package now. Greedy still
              checks automatically in the background.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-400">Shell version</dt>
                <dd className="font-medium text-slate-800">
                  {greedy?.appVersion ?? 'Browser dev mode'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Content version</dt>
                <dd className="font-medium text-slate-800">
                  {greedy?.contentVersion ?? 'Unavailable'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex items-start">
            <Button type="button" disabled={checkingUpdates || !greedy} onClick={checkForUpdates}>
              {checkingUpdates ? 'Checking…' : 'Check for update'}
            </Button>
          </div>
        </div>

        {updateMsg ? (
          <div className="mt-5">
            <Banner kind={updateMsg.kind} text={updateMsg.text} />
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Content update log</h3>
            <span className="text-xs text-slate-400">Last {updateLog.length} events</span>
          </div>
          {updateLog.length > 0 ? (
            <ol className="max-h-80 space-y-3 overflow-auto pr-2">
              {[...updateLog].reverse().map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className="grid grid-cols-[150px_minmax(0,1fr)] gap-3"
                >
                  <time className="font-mono text-xs text-slate-400" dateTime={entry.at}>
                    {new Date(entry.at).toLocaleString()}
                  </time>
                  <span className={statusTone(entry.status)}>{describeStatus(entry.status)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-slate-400">
              No update events recorded yet. Run a manual check to see each step here.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
