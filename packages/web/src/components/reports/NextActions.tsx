import type { NextAction } from '../../lib/reportAnalytics';

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
  'data-quality': {
    label: 'Data',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
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
    <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 p-5 ${meta.bg}`}>
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
      <p className="text-sm font-semibold leading-snug text-slate-900">{action.title}</p>
      <p className="text-sm leading-relaxed text-slate-600">{action.body}</p>
    </div>
  );
}

export function NextActions({ actions }: { actions: NextAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-400">
        Log views and new followers for a few videos to unlock recommendations.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action) => (
        <NextActionCard key={action.id} action={action} />
      ))}
    </div>
  );
}
