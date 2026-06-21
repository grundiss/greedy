import type { GlobalUpdate, Promotion, Update, Video, VideoWithUpdates } from '@greedy/shared';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { buildVideoReportRows, median } from '../lib/reportAnalytics';

type MetricKey = 'likes' | 'saves' | 'depthPct' | 'views' | 'comments' | 'reposts' | 'newFollowers';

const METRICS: { key: MetricKey; label: string; color: string; suffix?: string }[] = [
  { key: 'views', label: 'Views', color: '#2563eb' },
  { key: 'likes', label: 'Likes', color: '#e11d48' },
  { key: 'saves', label: 'Saves', color: '#0891b2' },
  { key: 'depthPct', label: 'Watch depth', color: '#7c3aed', suffix: '%' },
  { key: 'comments', label: 'Comments', color: '#f59e0b' },
  { key: 'reposts', label: 'Reposts', color: '#0d9488' },
  { key: 'newFollowers', label: 'New followers', color: '#db2777' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVideoId = searchParams.get('videoId') ?? '';
  const [videos, setVideos] = useState<Video[]>([]);
  const [allVideosWithUpdates, setAllVideosWithUpdates] = useState<VideoWithUpdates[]>([]);
  const [data, setData] = useState<VideoWithUpdates | null>(null);
  const [globalUpdates, setGlobalUpdates] = useState<GlobalUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const videoId = useMemo(() => {
    if (
      requestedVideoId &&
      (videos.length === 0 || videos.some((video) => String(video.id) === requestedVideoId))
    ) {
      return requestedVideoId;
    }

    return videos.length > 0 ? String(videos[0]!.id) : '';
  }, [requestedVideoId, videos]);

  function selectVideo(nextVideoId: string) {
    setSearchParams(nextVideoId ? { videoId: nextVideoId } : {});
  }

  useEffect(() => {
    api
      .listGlobalUpdates()
      .then((updates) => {
        setGlobalUpdates(updates);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load global updates'),
      );

    api
      .listVideos()
      .then(async (vs) => {
        setVideos(vs);
        setError(null);
        const withUpdates = await Promise.all(vs.map((v) => api.getVideo(v.id)));
        setAllVideosWithUpdates(withUpdates);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load videos'));
  }, []);

  useEffect(() => {
    if (!videoId) {
      setData(null);
      return;
    }

    setData(null);
    api
      .getVideo(Number(videoId))
      .then((nextData) => {
        setData(nextData);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load video'));
  }, [videoId]);

  const reportRows = useMemo(
    () => buildVideoReportRows(allVideosWithUpdates),
    [allVideosWithUpdates],
  );
  const debugSummary = useMemo(() => {
    const withUpdates = reportRows.filter((r) => r.dataQuality.hasUpdates).length;
    const medianF1k = median(
      reportRows.map((r) => r.followersPer1kViews).filter((v): v is number => v !== null),
    );
    return { total: reportRows.length, withUpdates, medianF1k };
  }, [reportRows]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="mt-1 text-slate-500">
            Compare account growth and per-video performance over time.
          </p>
        </div>

        <div className="w-96">
          <Field label="Video">
            <Select value={videoId} onChange={(e) => selectVideo(e.target.value)}>
              {videos.length === 0 ? <option value="">No videos yet</option> : null}
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {reportRows.length > 0 && (
        <div className="flex gap-6 rounded-lg border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
          <span>
            <strong className="text-slate-900">{debugSummary.total}</strong> videos
          </span>
          <span>
            <strong className="text-slate-900">{debugSummary.withUpdates}</strong> with updates
          </span>
          <span>
            Median followers/1k views:{' '}
            <strong className="text-slate-900">
              {debugSummary.medianF1k !== null ? debugSummary.medianF1k.toFixed(1) : '—'}
            </strong>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <GlobalUpdateChart updates={globalUpdates} />

        {data
          ? METRICS.map((m) => <MetricChart key={m.key} metric={m} updates={data.updates} />)
          : null}

        {data ? <PromotionsCard promotions={data.promotions} /> : null}
      </div>
    </div>
  );
}

function PromotionsCard({ promotions }: { promotions: Promotion[] }) {
  return (
    <Card title="Promotions">
      {promotions.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No promotions yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-medium">When</th>
              <th className="pb-2 text-right font-medium">Budget</th>
              <th className="pb-2 text-right font-medium">Followers gained</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-600">{formatTime(p.recordedAt)}</td>
                <td className="py-2 text-right tabular-nums">{p.budget ?? '—'}</td>
                <td className="py-2 text-right tabular-nums">{p.followersGained ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
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

function GlobalUpdateChart({ updates }: { updates: GlobalUpdate[] }) {
  const points = useMemo(
    () => updates.map((u) => ({ t: u.recordedAt, value: u.followers })),
    [updates],
  );

  return (
    <Card title="Followers">
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No global updates yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" tickFormatter={formatTime} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              labelFormatter={(v) => formatTime(String(v))}
              formatter={(value) => [String(value), 'Followers']}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
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
