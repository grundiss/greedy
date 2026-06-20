import type { Update, Video, VideoWithUpdates } from '@greedy/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, Field, Select } from '../components/ui';
import { api } from '../lib/api';

type MetricKey = 'likes' | 'saves' | 'depthPct';

const METRICS: { key: MetricKey; label: string; color: string; suffix?: string }[] = [
  { key: 'likes', label: 'Likes', color: '#e11d48' },
  { key: 'saves', label: 'Saves', color: '#0891b2' },
  { key: 'depthPct', label: 'Watch depth', color: '#7c3aed', suffix: '%' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function ReportsPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [videoId, setVideoId] = useState<string>('');
  const [data, setData] = useState<VideoWithUpdates | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listVideos()
      .then((vs) => {
        setVideos(vs);
        if (vs.length > 0) setVideoId(String(vs[0]!.id));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load videos'));
  }, []);

  useEffect(() => {
    if (!videoId) {
      setData(null);
      return;
    }
    api
      .getVideo(Number(videoId))
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load video'));
  }, [videoId]);

  return (
    <div className="flex flex-col gap-6 py-2">
      <Card>
        <Field label="Video">
          <Select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
            {videos.length === 0 ? <option value="">No videos yet</option> : null}
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {data ? (
        <>
          {METRICS.map((m) => (
            <MetricChart key={m.key} metric={m} updates={data.updates} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function MetricChart({ metric, updates }: { metric: (typeof METRICS)[number]; updates: Update[] }) {
  // Only plot updates that actually carry this metric.
  const points = useMemo(
    () =>
      updates
        .filter((u) => u[metric.key] !== null)
        .map((u) => ({ t: u.recordedAt, value: u[metric.key] as number })),
    [updates, metric.key],
  );

  return (
    <Card title={metric.label}>
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No data yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" tickFormatter={formatTime} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={metric.suffix === '%' ? [0, 100] : ['auto', 'auto']}
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(v) => formatTime(String(v))}
              formatter={(value) => [`${value}${metric.suffix ?? ''}`, metric.label]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={metric.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
