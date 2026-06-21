import type { PromotionReportRow, PromotionVerdict } from '../../lib/reportAnalytics';
import { fmt } from './utils';

const VERDICT_META: Record<PromotionVerdict, { label: string; bg: string; text: string }> = {
  scale: { label: 'Scale', bg: 'bg-green-100', text: 'text-green-700' },
  watch: { label: 'Watch', bg: 'bg-amber-100', text: 'text-amber-700' },
  stop: { label: 'Stop', bg: 'bg-red-100', text: 'text-red-700' },
  'missing-data': { label: 'Needs data', bg: 'bg-slate-100', text: 'text-slate-500' },
};

interface PromotionRoiProps {
  rows: PromotionReportRow[];
}

export function PromotionRoi({ rows }: PromotionRoiProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">Promotion ROI</h3>
        <p className="mt-0.5 text-sm text-slate-500">Was your ad spend worth it?</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-400">
          No promotions yet. Promotion ROI will appear after you log ad spend and followers gained.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Video</th>
                  <th className="px-4 py-3 text-right font-medium">Budget</th>
                  <th className="px-4 py-3 text-right font-medium">Promo followers</th>
                  <th className="px-4 py-3 text-right font-medium">Cost / follower</th>
                  <th className="px-4 py-3 text-right font-medium">Organic followers / 1k views</th>
                  <th className="px-4 py-3 text-right font-medium">Depth</th>
                  <th className="px-4 py-3 font-medium">Verdict</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const vm = VERDICT_META[row.verdict];
                  return (
                    <tr key={row.videoId} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.title}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {row.totalBudget !== null ? row.totalBudget : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {row.promotionFollowers !== null ? row.promotionFollowers : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {row.costPerFollower !== null ? fmt(row.costPerFollower, 2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {row.followersPer1kViews !== null ? fmt(row.followersPer1kViews) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {row.depthPct !== null ? `${row.depthPct.toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${vm.bg} ${vm.text}`}
                        >
                          {vm.label}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-2.5 text-xs leading-relaxed text-slate-500">
                        {row.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
