import type { AccountGrowthEvent, AccountGrowthEventKind } from '../../lib/reportAnalytics';
import { formatDate } from './utils';

const GROWTH_KIND_META: Record<
  AccountGrowthEventKind,
  { label: string; bg: string; text: string }
> = {
  'video-published': { label: 'Published', bg: 'bg-blue-100', text: 'text-blue-700' },
  promotion: { label: 'Promotion', bg: 'bg-purple-100', text: 'text-purple-700' },
  'follower-spike': { label: 'Spike', bg: 'bg-green-100', text: 'text-green-700' },
};

interface AccountGrowthTimelineProps {
  events: AccountGrowthEvent[];
}

export function AccountGrowthTimeline({ events }: AccountGrowthTimelineProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900">Account growth timeline</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Content activity mapped against account growth. Correlation only — not proof of cause.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-400">
          Log account follower updates to connect content with account growth.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {events.map((event) => {
              const km = GROWTH_KIND_META[event.kind];
              return (
                <li key={event.id} className="flex gap-4 px-4 py-3">
                  <time className="w-24 shrink-0 pt-0.5 text-xs text-slate-400">
                    {formatDate(event.date)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${km.bg} ${km.text}`}
                      >
                        {km.label}
                      </span>
                      <p className="text-sm font-medium text-slate-800">{event.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {event.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
