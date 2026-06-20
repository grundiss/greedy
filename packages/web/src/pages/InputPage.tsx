import type { Video } from '@greedy/shared';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Field, Select, TextInput } from '../components/ui';
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

export function InputPage() {
  const [videos, setVideos] = useState<Video[]>([]);

  const refreshVideos = useCallback(async () => {
    try {
      setVideos(await api.listVideos());
    } catch {
      // surfaced by individual forms; keep page usable
    }
  }, []);

  useEffect(() => {
    void refreshVideos();
  }, [refreshVideos]);

  return (
    <div className="flex flex-col gap-6 py-2">
      <LogUpdateForm videos={videos} />
      <AddVideoForm onCreated={refreshVideos} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function LogUpdateForm({ videos }: { videos: Video[] }) {
  const [videoId, setVideoId] = useState<string>('');
  const [likes, setLikes] = useState('');
  const [saves, setSaves] = useState('');
  const [depthPct, setDepthPct] = useState('');
  const [backdate, setBackdate] = useState(false);
  const [recordedAt, setRecordedAt] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep a valid selection as the video list loads/changes.
  useEffect(() => {
    if (!videoId && videos.length > 0) setVideoId(String(videos[0]!.id));
  }, [videos, videoId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!videoId) {
      setMsg({ kind: 'err', text: 'Pick a video first' });
      return;
    }
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    const payload = {
      likes: num(likes),
      saves: num(saves),
      depthPct: num(depthPct),
      recordedAt: backdate && recordedAt ? new Date(recordedAt).toISOString() : undefined,
    };
    if (
      payload.likes === undefined &&
      payload.saves === undefined &&
      payload.depthPct === undefined
    ) {
      setMsg({ kind: 'err', text: 'Enter at least one metric' });
      return;
    }
    setBusy(true);
    try {
      await api.addUpdate(Number(videoId), payload);
      setMsg({ kind: 'ok', text: 'Update saved ✓' });
      // Reset metrics but keep the selected video for fast repeat entry.
      setLikes('');
      setSaves('');
      setDepthPct('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log an update">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Video">
          <Select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
            {videos.length === 0 ? <option value="">No videos yet — add one below</option> : null}
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>

        <p className="text-xs text-slate-400">Fill in only what you have — blanks are skipped.</p>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Likes">
            <TextInput
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="—"
              value={likes}
              onChange={(e) => setLikes(e.target.value)}
            />
          </Field>
          <Field label="Saves">
            <TextInput
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="—"
              value={saves}
              onChange={(e) => setSaves(e.target.value)}
            />
          </Field>
          <Field label="Depth %">
            <TextInput
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="—"
              value={depthPct}
              onChange={(e) => setDepthPct(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={backdate}
            onChange={(e) => setBackdate(e.target.checked)}
          />
          Backdate this update
        </label>
        {backdate ? (
          <Field label="Recorded at">
            <TextInput
              type="datetime-local"
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
            />
          </Field>
        ) : null}

        {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
        <Button type="submit" disabled={busy || videos.length === 0}>
          {busy ? 'Saving…' : 'Save update'}
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AddVideoForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [tags, setTags] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) {
      setMsg({ kind: 'err', text: 'Title is required' });
      return;
    }
    setBusy(true);
    try {
      await api.createVideo({
        title: title.trim(),
        description: description.trim() || null,
        durationSeconds: duration.trim() === '' ? null : Number(duration),
        tags: tags
          .split(/[,\n]/)
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setMsg({ kind: 'ok', text: 'Video added ✓' });
      setTitle('');
      setDescription('');
      setDuration('');
      setTags('');
      onCreated();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add a video">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Title">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My new video"
          />
        </Field>
        <Field label="Short description">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What it's about"
          />
        </Field>
        <Field label="Duration (seconds)">
          <TextInput
            inputMode="numeric"
            pattern="[0-9]*"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 45"
          />
        </Field>
        <Field label="Tags" hint="Comma-separated">
          <TextInput
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="dance, comedy"
          />
        </Field>
        {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add video'}
        </Button>
      </form>
    </Card>
  );
}
