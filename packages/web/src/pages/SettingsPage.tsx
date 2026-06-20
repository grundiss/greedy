import { useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import { api } from '../lib/api';

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

export function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
        text: `Imported ${result.imported.videos} videos, ${result.imported.updates} updates, and ${result.imported.globalUpdates} global updates ✓`,
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
    </div>
  );
}
