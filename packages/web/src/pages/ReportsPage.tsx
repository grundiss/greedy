import type { GlobalUpdate, Promotion, Update, Video, VideoWithUpdates } from '@greedy/shared';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, Field, Select } from '../components/ui';
import { api } from '../lib/api';
import {
  aggregateByCreativeAttribute,
  aggregateByDuration,
  aggregateByTag,
  buildNextActions,
  buildVideoReportRows,
  median,
  type NextAction,
  type Recommendation,
  type ReportSegment,
} from '../lib/reportAnalytics';

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

  const summary = useMemo(() => {
    const withUpdates = reportRows.filter((r) => r.dataQuality.hasUpdates).length;
    const promoted = reportRows.filter((r) => r.promoted).length;
    const medianF1k = median(
      reportRows.map((r) => r.followersPer1kViews).filter((v): v is number => v !== null),
    );
    const medianCostPerFollower = median(
      reportRows.map((r) => r.costPerPromotionFollower).filter((v): v is number => v !== null),
    );
    return { total: reportRows.length, withUpdates, promoted, medianF1k, medianCostPerFollower };
  }, [reportRows]);

  const nextActions = useMemo(() => buildNextActions(reportRows), [reportRows]);

  const durationSegments = useMemo(() => aggregateByDuration(reportRows), [reportRows]);
  const tagSegments = useMemo(() => aggregateByTag(reportRows), [reportRows]);
  const hookSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'hookType'),
    [reportRows],
  );
  const faceSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'hasFace'),
    [reportRows],
  );
  const soundSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'soundType'),
    [reportRows],
  );
  const subtitleSegments = useMemo(
    () => aggregateByCreativeAttribute(reportRows, 'subtitles'),
    [reportRows],
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="mt-1 text-slate-500">What should you post, repeat, or promote next?</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Next actions */}
      {nextActions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-400">
          Add a few video updates to unlock recommendations.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nextActions.map((action) => (
            <NextActionCard key={action.id} action={action} />
          ))}
        </div>
      )}

      {/* What works */}
      <WhatWorksSection
        durationSegments={durationSegments}
        tagSegments={tagSegments}
        hookSegments={hookSegments}
        faceSegments={faceSegments}
        soundSegments={soundSegments}
        subtitleSegments={subtitleSegments}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Videos tracked" value={String(summary.total)} />
        <SummaryCard label="With updates" value={String(summary.withUpdates)} />
        <SummaryCard
          label="Median followers / 1k views"
          value={summary.medianF1k !== null ? summary.medianF1k.toFixed(1) : '—'}
        />
        <SummaryCard label="Promoted videos" value={String(summary.promoted)} />
        <SummaryCard
          label="Median cost / promoted follower"
          value={
            summary.medianCostPerFollower !== null ? summary.medianCostPerFollower.toFixed(2) : '—'
          }
        />
      </div>

      {/* Per-video charts */}
      <div>
        <div className="mb-4 flex items-center gap-4">
          <h3 className="text-lg font-semibold text-slate-800">Video charts</h3>
          <div className="w-72">
            <Field label="">
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

        <div className="grid grid-cols-2 gap-6">
          <GlobalUpdateChart updates={globalUpdates} />

          {data
            ? METRICS.map((m) => <MetricChart key={m.key} metric={m} updates={data.updates} />)
            : null}

          {data ? <PromotionsCard promotions={data.promotions} /> : null}
        </div>
      </div>
    </div>
  );
}

const KIND_META: Record<
  NextAction['kind'],
  { label: string; bg: string; text: string; dot: string }
> = {
  'double-down': {
    label: 'Repeat',
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  promote: { label: 'Promote', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  cut: { label: 'Cut', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  experiment: {
    label: 'Experiment',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
  },
  'data-quality': { label: 'Data', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  risk: { label: 'Risk', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
};

const PRIORITY_BADGE: Record<NextAction['priority'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-500',
};

function NextActionCard({ action }: { action: NextAction }) {
  const meta = KIND_META[action.kind];
  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 p-4 ${meta.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[action.priority]}`}
        >
          {action.priority}
        </span>
      </div>
      <p className="text-sm font-semibold text-slate-900 leading-snug">{action.title}</p>
      <p className="text-sm text-slate-600 leading-relaxed">{action.body}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
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

// ---------------------------------------------------------------------------
// What works — shared helpers
// ---------------------------------------------------------------------------

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return v.toFixed(decimals);
}

const REC_META: Record<Recommendation, { label: string; bg: string; text: string }> = {
  repeat: { label: 'Repeat', bg: 'bg-green-100', text: 'text-green-700' },
  'test-more': { label: 'Test more', bg: 'bg-blue-100', text: 'text-blue-700' },
  avoid: { label: 'Avoid', bg: 'bg-red-100', text: 'text-red-700' },
  'insufficient-data': { label: 'Needs data', bg: 'bg-slate-100', text: 'text-slate-500' },
};

const REC_BAR_COLOR: Record<Recommendation, string> = {
  repeat: '#16a34a',
  'test-more': '#2563eb',
  avoid: '#dc2626',
  'insufficient-data': '#94a3b8',
};

const CONF_LABEL: Record<ReportSegment['confidence'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const CONF_TEXT: Record<ReportSegment['confidence'], string> = {
  high: 'text-green-600',
  medium: 'text-amber-600',
  low: 'text-slate-400',
};

function RecommendationBadge({ rec }: { rec: Recommendation }) {
  const m = REC_META[rec];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${m.bg} ${m.text}`}
    >
      {m.label}
    </span>
  );
}

function ConfidencePill({ conf }: { conf: ReportSegment['confidence'] }) {
  return <span className={`text-xs font-medium ${CONF_TEXT[conf]}`}>{CONF_LABEL[conf]}</span>;
}

// ---------------------------------------------------------------------------
// Segments bar chart + table (shared for Duration and creative attrs)
// ---------------------------------------------------------------------------

function SegmentsView({
  segments,
  nameHeader,
  showDepth = true,
  showSaves = false,
}: {
  segments: ReportSegment[];
  nameHeader: string;
  showDepth?: boolean;
  showSaves?: boolean;
}) {
  if (segments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">No data yet for this dimension.</p>
    );
  }

  const chartData = segments.map((s) => ({
    label: s.label,
    value: s.medianFollowersPer1kViews ?? 0,
    recommendation: s.recommendation,
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value: number) => [value.toFixed(1), 'Followers / 1k views']}
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={REC_BAR_COLOR[entry.recommendation]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 pr-4 font-medium">{nameHeader}</th>
              <th className="pb-2 pr-4 text-right font-medium">Videos</th>
              <th className="pb-2 pr-4 text-right font-medium">Median views</th>
              {showDepth && <th className="pb-2 pr-4 text-right font-medium">Median depth</th>}
              {showSaves && <th className="pb-2 pr-4 text-right font-medium">Saves / 1k views</th>}
              <th className="pb-2 pr-4 text-right font-medium">Followers / 1k views</th>
              <th className="pb-2 pr-4 text-right font-medium">Confidence</th>
              <th className="pb-2 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.key} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-800">{s.label}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                  {s.videosCount}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                  {fmt(s.medianViews, 0)}
                </td>
                {showDepth && (
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                    {s.medianDepthPct !== null ? `${fmt(s.medianDepthPct)}%` : '—'}
                  </td>
                )}
                {showSaves && (
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                    {fmt(s.medianSavesPer1kViews)}
                  </td>
                )}
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-slate-900">
                  {fmt(s.medianFollowersPer1kViews)}
                </td>
                <td className="py-2 pr-4 text-right">
                  <ConfidencePill conf={s.confidence} />
                </td>
                <td className="py-2">
                  <RecommendationBadge rec={s.recommendation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tags table
// ---------------------------------------------------------------------------

const REC_SORT_PRIORITY: Record<Recommendation, number> = {
  repeat: 0,
  'test-more': 1,
  avoid: 2,
  'insufficient-data': 3,
};

function TagsView({ segments }: { segments: ReportSegment[] }) {
  const visible = segments
    .filter((s) => s.videosCount > 0)
    .sort((a, b) => {
      const pDiff = REC_SORT_PRIORITY[a.recommendation] - REC_SORT_PRIORITY[b.recommendation];
      if (pDiff !== 0) return pDiff;
      return (b.medianFollowersPer1kViews ?? -1) - (a.medianFollowersPer1kViews ?? -1);
    })
    .slice(0, 12);

  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        Add tags to your videos to learn which topics grow the account.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-2 pr-4 font-medium">Tag</th>
            <th className="pb-2 pr-4 text-right font-medium">Videos</th>
            <th className="pb-2 pr-4 text-right font-medium">Followers / 1k views</th>
            <th className="pb-2 pr-4 text-right font-medium">Saves / 1k views</th>
            <th className="pb-2 pr-4 text-right font-medium">Reposts / 1k views</th>
            <th className="pb-2 pr-4 text-right font-medium">Confidence</th>
            <th className="pb-2 font-medium">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => (
            <tr key={s.key} className="border-t border-slate-100">
              <td className="py-2 pr-4 font-medium text-slate-800">{s.label}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{s.videosCount}</td>
              <td className="py-2 pr-4 text-right tabular-nums font-semibold text-slate-900">
                {fmt(s.medianFollowersPer1kViews)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                {fmt(s.medianSavesPer1kViews)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                {fmt(s.medianRepostsPer1kViews)}
              </td>
              <td className="py-2 pr-4 text-right">
                <ConfidencePill conf={s.confidence} />
              </td>
              <td className="py-2">
                <RecommendationBadge rec={s.recommendation} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What works section with tabs
// ---------------------------------------------------------------------------

type WhatWorksTab = 'duration' | 'tags' | 'hook' | 'face' | 'sound' | 'subtitles';

const WHAT_WORKS_TABS: { key: WhatWorksTab; label: string }[] = [
  { key: 'duration', label: 'Duration' },
  { key: 'tags', label: 'Tags' },
  { key: 'hook', label: 'Hook' },
  { key: 'face', label: 'Face' },
  { key: 'sound', label: 'Sound' },
  { key: 'subtitles', label: 'Subtitles' },
];

function WhatWorksSection({
  durationSegments,
  tagSegments,
  hookSegments,
  faceSegments,
  soundSegments,
  subtitleSegments,
}: {
  durationSegments: ReportSegment[];
  tagSegments: ReportSegment[];
  hookSegments: ReportSegment[];
  faceSegments: ReportSegment[];
  soundSegments: ReportSegment[];
  subtitleSegments: ReportSegment[];
}) {
  const [tab, setTab] = useState<WhatWorksTab>('duration');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">What works</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Patterns that actually convert views into followers.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {WHAT_WORKS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {tab === 'duration' && (
          <SegmentsView segments={durationSegments} nameHeader="Duration" showDepth showSaves />
        )}
        {tab === 'tags' && <TagsView segments={tagSegments} />}
        {tab === 'hook' && (
          <SegmentsView segments={hookSegments} nameHeader="Hook type" showDepth showSaves />
        )}
        {tab === 'face' && (
          <SegmentsView segments={faceSegments} nameHeader="Face in video" showDepth />
        )}
        {tab === 'sound' && (
          <SegmentsView segments={soundSegments} nameHeader="Sound type" showDepth showSaves />
        )}
        {tab === 'subtitles' && (
          <SegmentsView segments={subtitleSegments} nameHeader="Subtitles" showDepth showSaves />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
