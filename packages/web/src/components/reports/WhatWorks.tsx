import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Recommendation, ReportSegment } from '../../lib/reportAnalytics';
import { fmt } from './utils';

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

const REC_SORT_PRIORITY: Record<Recommendation, number> = {
  repeat: 0,
  'test-more': 1,
  avoid: 2,
  'insufficient-data': 3,
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
        Add tags to compare topics and content pillars.
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

type WhatWorksTab = 'duration' | 'tags' | 'hook' | 'face' | 'sound' | 'subtitles';

const WHAT_WORKS_TABS: { key: WhatWorksTab; label: string }[] = [
  { key: 'duration', label: 'Duration' },
  { key: 'tags', label: 'Tags' },
  { key: 'hook', label: 'Hook' },
  { key: 'face', label: 'Face' },
  { key: 'sound', label: 'Sound' },
  { key: 'subtitles', label: 'Subtitles' },
];

interface WhatWorksSectionProps {
  durationSegments: ReportSegment[];
  tagSegments: ReportSegment[];
  hookSegments: ReportSegment[];
  faceSegments: ReportSegment[];
  soundSegments: ReportSegment[];
  subtitleSegments: ReportSegment[];
}

export function WhatWorksSection({
  durationSegments,
  tagSegments,
  hookSegments,
  faceSegments,
  soundSegments,
  subtitleSegments,
}: WhatWorksSectionProps) {
  const [tab, setTab] = useState<WhatWorksTab>('duration');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">What works</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Patterns that actually convert views into followers.
        </p>
      </div>

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
