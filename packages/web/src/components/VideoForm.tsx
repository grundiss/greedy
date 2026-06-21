import type { Video } from '@greedy/shared';
import { useEffect, useState } from 'react';
import { Button, Card, Field, Select, TextInput } from './ui';
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

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function VideoForm({
  video,
  onSaved,
  onCancelEdit,
}: {
  video?: Video | null;
  onSaved: (video: Video) => void;
  onCancelEdit?: () => void;
}) {
  const editing = Boolean(video);
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

  useEffect(() => {
    setTitle(video?.title ?? '');
    setDescription(video?.description ?? '');
    setDuration(
      video?.durationSeconds === null || video?.durationSeconds === undefined
        ? ''
        : String(video.durationSeconds),
    );
    setTags(video?.tags.join(', ') ?? '');
    setPublishedAt(video ? toDatetimeLocal(video.publishedAt) : '');
    setHasFace(
      video?.hasFace === null || video?.hasFace === undefined ? '' : video.hasFace ? 'yes' : 'no',
    );
    setHookType(video?.hookType ?? '');
    setSoundType(video?.soundType ?? '');
    setSubtitles(
      video?.subtitles === null || video?.subtitles === undefined
        ? ''
        : video.subtitles
          ? 'yes'
          : 'no',
    );
    setMsg(null);
  }, [video]);

  function clearForm() {
    setTitle('');
    setDescription('');
    setDuration('');
    setTags('');
    setPublishedAt('');
    setHasFace('');
    setHookType('');
    setSoundType('');
    setSubtitles('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) {
      setMsg({ kind: 'err', text: 'Title is required' });
      return;
    }

    setBusy(true);
    try {
      const payload = {
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
      };
      const saved = video
        ? await api.updateVideo(video.id, payload)
        : await api.createVideo(payload);
      setMsg({ kind: 'ok', text: video ? 'Video saved' : 'Video added' });
      if (!video) clearForm();
      onSaved(saved);
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={editing ? 'Edit video' : 'Add a video'}>
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
            <option value="">-</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Hook type">
          <Select value={hookType} onChange={(e) => setHookType(e.target.value)}>
            <option value="">-</option>
            <option value="none">None</option>
            <option value="question">Question</option>
            <option value="result">Result</option>
          </Select>
        </Field>
        <Field label="Sound type">
          <Select value={soundType} onChange={(e) => setSoundType(e.target.value)}>
            <option value="">-</option>
            <option value="music">Mostly music</option>
            <option value="voice">Mostly voice</option>
          </Select>
        </Field>
        <Field label="Subtitles">
          <Select value={subtitles} onChange={(e) => setSubtitles(e.target.value)}>
            <option value="">-</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        {msg ? (
          <div className="col-span-2">
            <Banner kind={msg.kind} text={msg.text} />
          </div>
        ) : null}
        <Button type="submit" disabled={busy} className={editing ? '' : 'col-span-2'}>
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Add video'}
        </Button>
        {editing ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancelEdit}>
            Cancel
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
