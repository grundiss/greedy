import { fmt, fmtLarge } from './utils';

interface Summary {
  total: number;
  withUpdates: number;
  promoted: number;
  medianF1k: number | null;
  medianCostPerFollower: number | null;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryCard label="Videos tracked" value={fmtLarge(summary.total)} />
      <SummaryCard label="With updates" value={fmtLarge(summary.withUpdates)} />
      <SummaryCard label="Median followers / 1k views" value={fmt(summary.medianF1k)} />
      <SummaryCard label="Promoted videos" value={fmtLarge(summary.promoted)} />
      <SummaryCard
        label="Median cost / promoted follower"
        value={fmt(summary.medianCostPerFollower, 2)}
      />
    </div>
  );
}
