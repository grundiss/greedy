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
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Data input</h2>
        <p className="mt-1 text-slate-500">
          Log fresh metrics and add videos without leaving your desk workflow.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(360px,420px)] items-start gap-6">
        <div className="space-y-6">
          <LogGlobalUpdateForm />
          <LogUpdateForm videos={videos} />
        </div>
        <AddVideoForm onCreated={refreshVideos} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LogGlobalUpdateForm() {
  const [followers, setFollowers] = useState('');
  const [backdate, setBackdate] = useState(false);
  const [recordedAt, setRecordedAt] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (followers.trim() === '') {
      setMsg({ kind: 'err', text: 'Enter the current follower count' });
      return;
    }

    setBusy(true);
    try {
      await api.addGlobalUpdate({
        followers: Number(followers),
        recordedAt: backdate && recordedAt ? new Date(recordedAt).toISOString() : undefined,
      });
      setMsg({ kind: 'ok', text: 'Global update saved ✓' });
      setFollowers('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log a global update">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-xs text-slate-400">
          Track account-level numbers that are not tied to a single video.
        </p>

        <Field label="Current followers">
          <TextInput
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 12000"
            value={followers}
            onChange={(e) => setFollowers(e.target.value)}
          />
        </Field>

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

        {msg ? (
          <div className="col-span-2">
            <Banner kind={msg.kind} text={msg.text} />
          </div>
        ) : null}
        <Button type="submit" disabled={busy} className="col-span-2">
          {busy ? 'Saving…' : 'Save global update'}
        </Button>
      </form>
    </Card>
  );
}

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
      <form onSubmit={submit} className="grid gap-4">
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
  const [publishedAt, setPublishedAt] = useState('');
  const [hasFace, setHasFace] = useState('');
  const [hookType, setHookType] = useState('');
  const [soundType, setSoundType] = useState('');
  const [subtitles, setSubtitles] = useState('');
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
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        hasFace: hasFace === '' ? null : hasFace === 'yes',
        hookType: hookType === '' ? null : (hookType as 'none' | 'question' | 'result'),
        soundType: soundType === '' ? null : (soundType as 'music' | 'voice'),
        subtitles: subtitles === '' ? null : subtitles === 'yes',
      });
      setMsg({ kind: 'ok', text: 'Video added ✓' });
      setTitle('');
      setDescription('');
      setDuration('');
      setTags('');
      setPublishedAt('');
      setHasFace('');
      setHookType('');
      setSoundType('');
      setSubtitles('');
      onCreated();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add a video">
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Title">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My new video"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Short description">
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it's about"
            />
          </Field>
        </div>
        <Field label="Duration (seconds)">
          <TextInput
            inputMode="numeric"
            pattern="[0-9]*"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 45"
          />
        </Field>
        <div className="col-span-2">
          <Field label="Tags" hint="Comma-separated">
            <TextInput
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="dance, comedy"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Published at" hint="When it went live">
            <TextInput
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Has face">
          <Select value={hasFace} onChange={(e) => setHasFace(e.target.value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Hook type">
          <Select value={hookType} onChange={(e) => setHookType(e.target.value)}>
            <option value="">—</option>
            <option value="none">None</option>
            <option value="question">Question</option>
            <option value="result">Result</option>
          </Select>
        </Field>
        <Field label="Sound type">
          <Select value={soundType} onChange={(e) => setSoundType(e.target.value)}>
            <option value="">—</option>
            <option value="music">Mostly music</option>
            <option value="voice">Mostly voice</option>
          </Select>
        </Field>
        <Field label="Subtitles">
          <Select value={subtitles} onChange={(e) => setSubtitles(e.target.value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        {msg ? (
          <div className="col-span-2">
            <Banner kind={msg.kind} text={msg.text} />
          </div>
        ) : null}
        <Button type="submit" disabled={busy} className="col-span-2">
          {busy ? 'Saving…' : 'Add video'}
        </Button>
      </form>
    </Card>
  );
}
