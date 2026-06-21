import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortfolioPoint, PortfolioQuadrant } from '../../lib/reportAnalytics';

const QUADRANT_COLORS: Record<PortfolioQuadrant, string> = {
  star: '#16a34a',
  'niche-gem': '#2563eb',
  'viral-but-weak': '#f59e0b',
  dead: '#94a3b8',
};

const QUADRANT_LABELS: Record<PortfolioQuadrant, string> = {
  star: 'Stars',
  'niche-gem': 'Niche gems',
  'viral-but-weak': 'Viral but weak',
  dead: 'Dead content',
};

const QUADRANT_DESC: Record<PortfolioQuadrant, string> = {
  star: 'High reach, high conversion',
  'niche-gem': 'Low reach, high conversion',
  'viral-but-weak': 'High reach, low conversion',
  dead: 'Low reach, low conversion',
};

function PortfolioTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PortfolioPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="max-w-52 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="font-semibold leading-snug text-slate-900">{p.title}</p>
      <div className="mt-1.5 space-y-0.5 text-slate-600">
        <p>Views: {p.views.toLocaleString()}</p>
        <p>Followers / 1k views: {p.followersPer1kViews.toFixed(1)}</p>
        {p.savesPer1kViews !== null && <p>Saves / 1k views: {p.savesPer1kViews.toFixed(1)}</p>}
        {p.promoted && <p className="text-purple-600">Promoted</p>}
      </div>
      <p className="mt-1.5 font-medium text-slate-700">{QUADRANT_LABELS[p.quadrant]}</p>
      <p className="mt-0.5 leading-snug text-slate-500">{p.recommendation}</p>
    </div>
  );
}

interface PortfolioMatrixProps {
  points: PortfolioPoint[];
}

export function PortfolioMatrix({ points }: PortfolioMatrixProps) {
  if (points.length < 3) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Content portfolio</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            How your videos compare on reach vs. conversion.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-400">
          Add views and new followers for at least 3 videos to unlock the portfolio matrix.
        </div>
      </div>
    );
  }

  const allViews = points.map((p) => p.views);
  const allF1k = points.map((p) => p.followersPer1kViews);
  const medV =
    allViews.length > 0
      ? [...allViews].sort((a, b) => a - b)[Math.floor(allViews.length / 2)]
      : null;
  const medF =
    allF1k.length > 0 ? [...allF1k].sort((a, b) => a - b)[Math.floor(allF1k.length / 2)] : null;

  const byQuadrant = (['star', 'niche-gem', 'viral-but-weak', 'dead'] as PortfolioQuadrant[]).map(
    (q) => ({ quadrant: q, data: points.filter((p) => p.quadrant === q) }),
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">Content portfolio</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          How your videos compare on reach vs. conversion.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="views"
              name="Views"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              label={{
                value: 'Views →',
                position: 'insideBottomRight',
                offset: -4,
                fill: '#94a3b8',
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="followersPer1kViews"
              name="Followers / 1k views"
              tick={{ fontSize: 11 }}
              label={{
                value: 'Followers / 1k ↑',
                angle: -90,
                position: 'insideLeft',
                offset: 12,
                fill: '#94a3b8',
                fontSize: 11,
              }}
            />
            <Tooltip content={(props: any) => <PortfolioTooltip {...props} />} />
            {medV != null && <ReferenceLine x={medV} stroke="#cbd5e1" strokeDasharray="4 4" />}
            {medF != null && <ReferenceLine y={medF} stroke="#cbd5e1" strokeDasharray="4 4" />}
            {byQuadrant.map(({ quadrant, data }) =>
              data.length === 0 ? null : (
                <Scatter
                  key={quadrant}
                  name={QUADRANT_LABELS[quadrant]}
                  data={data}
                  fill={QUADRANT_COLORS[quadrant]}
                  shape={(shapeProps: any) => {
                    const cx = Number(shapeProps.cx);
                    const cy = Number(shapeProps.cy);
                    const fill = String(shapeProps.fill ?? QUADRANT_COLORS[quadrant]);
                    const promoted = Boolean(shapeProps.promoted);
                    if (promoted) {
                      return (
                        <g>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={9}
                            fill="none"
                            stroke={fill}
                            strokeWidth={2.5}
                          />
                          <circle cx={cx} cy={cy} r={3} fill={fill} />
                        </g>
                      );
                    }
                    return <circle cx={cx} cy={cy} r={6} fill={fill} fillOpacity={0.85} />;
                  }}
                />
              ),
            )}
          </ScatterChart>
        </ResponsiveContainer>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          {(['star', 'niche-gem', 'viral-but-weak', 'dead'] as PortfolioQuadrant[]).map((q) => (
            <div key={q} className="flex items-start gap-2">
              <span
                className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: QUADRANT_COLORS[q] }}
              />
              <div>
                <p className="text-xs font-semibold text-slate-700">{QUADRANT_LABELS[q]}</p>
                <p className="text-xs text-slate-400">{QUADRANT_DESC[q]}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5" fill="#64748b" fillOpacity={0.85} />
            </svg>
            Organic
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="6" fill="none" stroke="#64748b" strokeWidth="2" />
              <circle cx="7" cy="7" r="2" fill="#64748b" />
            </svg>
            Promoted
          </span>
        </div>
      </div>
    </div>
  );
}
