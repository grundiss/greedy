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
        <p className="mt-1 text-slate-500">Log fresh metrics without leaving your desk workflow.</p>
      </div>

      <div className="grid grid-cols-2 items-start gap-6">
        <LogGlobalUpdateForm />
        <LogPromotionForm videos={videos} />
      </div>
      <LogUpdateForm videos={videos} />
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
  const [views, setViews] = useState('');
  const [comments, setComments] = useState('');
  const [reposts, setReposts] = useState('');
  const [newFollowers, setNewFollowers] = useState('');
  const [hate, setHate] = useState(''); // '' = unknown, 'yes', 'no'
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
    const metrics = {
      likes: num(likes),
      saves: num(saves),
      depthPct: num(depthPct),
      views: num(views),
      comments: num(comments),
      reposts: num(reposts),
      newFollowers: num(newFollowers),
    };
    const payload = {
      ...metrics,
      hate: hate === '' ? undefined : hate === 'yes',
      recordedAt: backdate && recordedAt ? new Date(recordedAt).toISOString() : undefined,
    };
    if (Object.values(metrics).every((v) => v === undefined)) {
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
      setViews('');
      setComments('');
      setReposts('');
      setNewFollowers('');
      setHate('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  const numField = (label: string, value: string, set: (v: string) => void) => (
    <Field label={label}>
      <TextInput
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="—"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </Field>
  );

  return (
    <Card title="Log an update">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Video">
          <Select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
            {videos.length === 0 ? (
              <option value="">No videos yet - add one in Videos</option>
            ) : null}
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>

        <p className="text-xs text-slate-400">Fill in only what you have — blanks are skipped.</p>

        <div className="grid grid-cols-4 gap-3">
          {numField('Likes', likes, setLikes)}
          {numField('Saves', saves, setSaves)}
          {numField('Depth %', depthPct, setDepthPct)}
          {numField('Views', views, setViews)}
          {numField('Comments', comments, setComments)}
          {numField('Reposts', reposts, setReposts)}
          {numField('New followers', newFollowers, setNewFollowers)}
          <Field label="Hate in comments">
            <Select value={hate} onChange={(e) => setHate(e.target.value)}>
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
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

function LogPromotionForm({ videos }: { videos: Video[] }) {
  const [videoId, setVideoId] = useState<string>('');
  const [budget, setBudget] = useState('');
  const [followersGained, setFollowersGained] = useState('');
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
      budget: num(budget),
      followersGained: num(followersGained),
      recordedAt: backdate && recordedAt ? new Date(recordedAt).toISOString() : undefined,
    };
    if (payload.budget === undefined && payload.followersGained === undefined) {
      setMsg({ kind: 'err', text: 'Enter a budget or followers gained' });
      return;
    }
    setBusy(true);
    try {
      await api.addPromotion(Number(videoId), payload);
      setMsg({ kind: 'ok', text: 'Promotion saved ✓' });
      setBudget('');
      setFollowersGained('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log a promotion">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-xs text-slate-400">Record a paid ad campaign that promoted a video.</p>

        <Field label="Video">
          <Select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
            {videos.length === 0 ? (
              <option value="">No videos yet - add one in Videos</option>
            ) : null}
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget">
            <TextInput
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="—"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <Field label="Followers gained">
            <TextInput
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="—"
              value={followersGained}
              onChange={(e) => setFollowersGained(e.target.value)}
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
          Backdate this promotion
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
          {busy ? 'Saving…' : 'Save promotion'}
        </Button>
      </form>
    </Card>
  );
}
