import type { GlobalUpdate, Promotion, Update, Video, VideoWithUpdates } from '@greedy/shared';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, Field, Select } from '../ui';
import type {
  PortfolioPoint,
  PortfolioQuadrant,
  PromotionReportRow,
  PromotionVerdict,
  VideoReportRow,
} from '../../lib/reportAnalytics';
import { fmt, formatDate, formatDateTime } from './utils';

type MetricKey = 'views' | 'newFollowers' | 'depthPct' | 'saves' | 'reposts' | 'comments' | 'likes';

const METRICS: { key: MetricKey; label: string; color: string; suffix?: string }[] = [
  { key: 'views', label: 'Views', color: '#2563eb' },
  { key: 'newFollowers', label: 'New followers', color: '#db2777' },
  { key: 'depthPct', label: 'Watch depth', color: '#7c3aed', suffix: '%' },
  { key: 'saves', label: 'Saves', color: '#0891b2' },
  { key: 'reposts', label: 'Reposts', color: '#0d9488' },
  { key: 'comments', label: 'Comments', color: '#f59e0b' },
  { key: 'likes', label: 'Likes', color: '#e11d48' },
];

const QUADRANT_LABEL: Record<PortfolioQuadrant, string> = {
  star: 'Star',
  'niche-gem': 'Niche gem',
  'viral-but-weak': 'Viral but weak',
  dead: 'Dead content',
};

const VERDICT_DISPLAY: Record<PromotionVerdict, { label: string; bg: string; text: string }> = {
  scale: { label: 'Scale', bg: 'bg-green-100', text: 'text-green-700' },
  watch: { label: 'Watch', bg: 'bg-amber-100', text: 'text-amber-700' },
  stop: { label: 'Stop', bg: 'bg-red-100', text: 'text-red-700' },
  'missing-data': { label: 'Needs data', bg: 'bg-slate-100', text: 'text-slate-500' },
};

function MetricChart({ metric, updates }: { metric: (typeof METRICS)[number]; updates: Update[] }) {
  const points = useMemo(
    () =>
      updates
        .filter((u) => u[metric.key] !== null)
        .map((u) => ({ t: u.recordedAt, value: u[metric.key] as number })),
    [updates, metric.key],
  );

  return (
    <Card title={metric.label}>
      {points.length < 2 ? (
        <p className="py-4 text-center text-sm text-slate-400">Not enough data points yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="t"
              tickFormatter={formatDateTime}
              tick={{ fontSize: 11 }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={metric.suffix === '%' ? [0, 100] : ['auto', 'auto']}
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(v) => formatDateTime(String(v))}
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
    <Card title="Account followers">
      {points.length < 2 ? (
        <p className="py-4 text-center text-sm text-slate-400">Not enough data points yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="t"
              tickFormatter={formatDateTime}
              tick={{ fontSize: 11 }}
              minTickGap={24}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              labelFormatter={(v) => formatDateTime(String(v))}
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

function PromotionsCard({ promotions }: { promotions: Promotion[] }) {
  return (
    <Card title="Promotions">
      {promotions.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No promotions for this video.</p>
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
                <td className="py-2 text-slate-600">{formatDateTime(p.recordedAt)}</td>
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

function VideoMeta({
  reportRow,
  portfolioPoint,
  promotionRow,
}: {
  reportRow: VideoReportRow;
  portfolioPoint: PortfolioPoint | null;
  promotionRow: PromotionReportRow | null;
}) {
  const { video, latest, durationBucket: durBucket, promoted } = reportRow;
  const f1k = reportRow.followersPer1kViews;
  const s1k = reportRow.savesPer1kViews;
  const depth = latest.depthPct;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold leading-snug text-slate-900">{video.title}</h4>
          {video.publishedAt && (
            <p className="mt-0.5 text-xs text-slate-400">{formatDate(video.publishedAt)}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {durBucket !== 'unknown' && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {durBucket}
              </span>
            )}
            {video.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
              >
                {tag}
              </span>
            ))}
            {promoted && (
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                Promoted
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-400">Followers / 1k</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmt(f1k)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Saves / 1k</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmt(s1k)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Watch depth</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {depth !== null ? `${fmt(depth, 0)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {(portfolioPoint || promotionRow) && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {portfolioPoint && (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {QUADRANT_LABEL[portfolioPoint.quadrant]}
              </span>{' '}
              — {portfolioPoint.recommendation}
            </p>
          )}
          {promotionRow && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_DISPLAY[promotionRow.verdict].bg} ${VERDICT_DISPLAY[promotionRow.verdict].text}`}
              >
                {VERDICT_DISPLAY[promotionRow.verdict].label}
              </span>
              {promotionRow.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface SelectedVideoDeepDiveProps {
  videos: Video[];
  videoId: string;
  onSelectVideo: (id: string) => void;
  data: VideoWithUpdates | null;
  reportRow: VideoReportRow | null;
  portfolioPoint: PortfolioPoint | null;
  promotionRow: PromotionReportRow | null;
  globalUpdates: GlobalUpdate[];
}

export function SelectedVideoDeepDive({
  videos,
  videoId,
  onSelectVideo,
  data,
  reportRow,
  portfolioPoint,
  promotionRow,
  globalUpdates,
}: SelectedVideoDeepDiveProps) {
  if (videos.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">
          Selected video deep dive
        </h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Use this to inspect how one video changed over time.
        </p>
      </div>

      <div className="w-72">
        <Field label="Video">
          <Select value={videoId} onChange={(e) => onSelectVideo(e.target.value)}>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {data && reportRow ? (
        <>
          <VideoMeta
            reportRow={reportRow}
            portfolioPoint={portfolioPoint}
            promotionRow={promotionRow}
          />
          <div className="grid grid-cols-2 gap-6">
            <GlobalUpdateChart updates={globalUpdates} />
            {METRICS.map((m) => (
              <MetricChart key={m.key} metric={m} updates={data.updates} />
            ))}
            <PromotionsCard promotions={data.promotions} />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400">Loading video data…</p>
      )}
    </div>
  );
}
