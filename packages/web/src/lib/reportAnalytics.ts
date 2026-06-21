import type { Update, VideoWithUpdates } from '@greedy/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DurationBucket =
  | '0-15s'
  | '16-30s'
  | '31-45s'
  | '46-60s'
  | '61-90s'
  | '90s+'
  | 'unknown';

export type Confidence = 'low' | 'medium' | 'high';

export interface VideoReportRow {
  video: VideoWithUpdates;
  latest: {
    views: number | null;
    likes: number | null;
    saves: number | null;
    depthPct: number | null;
    comments: number | null;
    reposts: number | null;
    newFollowers: number | null;
    hate: boolean | null;
  };
  durationBucket: DurationBucket;
  promoted: boolean;
  totalPromotionBudget: number | null;
  totalPromotionFollowers: number | null;
  costPerPromotionFollower: number | null;

  followersPer1kViews: number | null;
  likesPer1kViews: number | null;
  savesPer1kViews: number | null;
  commentsPer1kViews: number | null;
  repostsPer1kViews: number | null;
  engagementPer1kViews: number | null;

  dataQuality: {
    hasUpdates: boolean;
    hasViews: boolean;
    hasFollowers: boolean;
    hasDuration: boolean;
    hasTags: boolean;
    missingCriticalFields: string[];
  };
}

export interface AggregateRow {
  key: string;
  label: string;
  videosCount: number;
  medianViews: number | null;
  medianDepthPct: number | null;
  medianFollowersPer1kViews: number | null;
  medianSavesPer1kViews: number | null;
  medianRepostsPer1kViews: number | null;
  confidence: Confidence;
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const result = numerator / denominator;
  if (!isFinite(result) || isNaN(result)) return null;
  return result;
}

export function ratePer1000(numerator: number | null, denominator: number | null): number | null {
  const r = safeDiv(numerator, denominator);
  if (r === null) return null;
  return r * 1000;
}

export function median(values: number[]): number | null {
  const finite = values.filter((v) => isFinite(v) && !isNaN(v));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function sumNullable(values: (number | null | undefined)[]): number | null {
  const defined = values.filter((v): v is number => v !== null && v !== undefined);
  if (defined.length === 0) return null;
  return defined.reduce((acc, v) => acc + v, 0);
}

// Returns the last non-null value of `key` across updates sorted oldest→newest.
export function latestMetric<K extends keyof Update>(updates: Update[], key: K): Update[K] | null {
  const sorted = [...updates].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );
  let result: Update[K] | null = null;
  for (const u of sorted) {
    if (u[key] !== null && u[key] !== undefined) result = u[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Duration bucket
// ---------------------------------------------------------------------------

export function durationBucket(durationSeconds: number | null | undefined): DurationBucket {
  if (durationSeconds === null || durationSeconds === undefined) return 'unknown';
  if (durationSeconds <= 15) return '0-15s';
  if (durationSeconds <= 30) return '16-30s';
  if (durationSeconds <= 45) return '31-45s';
  if (durationSeconds <= 60) return '46-60s';
  if (durationSeconds <= 90) return '61-90s';
  return '90s+';
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

function confidence(count: number): Confidence {
  if (count >= 7) return 'high';
  if (count >= 3) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Per-video row builder
// ---------------------------------------------------------------------------

export function buildVideoReportRow(video: VideoWithUpdates): VideoReportRow {
  const { updates, promotions } = video;

  const latest = {
    views: latestMetric(updates, 'views'),
    likes: latestMetric(updates, 'likes'),
    saves: latestMetric(updates, 'saves'),
    depthPct: latestMetric(updates, 'depthPct'),
    comments: latestMetric(updates, 'comments'),
    reposts: latestMetric(updates, 'reposts'),
    newFollowers: latestMetric(updates, 'newFollowers'),
    hate: latestMetric(updates, 'hate'),
  };

  const { views, likes, saves, comments, reposts, newFollowers } = latest;

  const followersPer1kViews = ratePer1000(newFollowers, views);
  const likesPer1kViews = ratePer1000(likes, views);
  const savesPer1kViews = ratePer1000(saves, views);
  const commentsPer1kViews = ratePer1000(comments, views);
  const repostsPer1kViews = ratePer1000(reposts, views);

  // engagement = sum of available engagement metrics / views * 1000
  let engagementPer1kViews: number | null = null;
  if (views !== null && views > 0) {
    const parts = [likes, saves, comments, reposts];
    if (parts.some((v) => v !== null)) {
      const total = parts.reduce<number>((acc, v) => acc + (v ?? 0), 0);
      engagementPer1kViews = (total / views) * 1000;
      if (!isFinite(engagementPer1kViews) || isNaN(engagementPer1kViews)) {
        engagementPer1kViews = null;
      }
    }
  }

  const promotionBudgets = promotions.map((p) => p.budget).filter((v): v is number => v !== null);
  const promotionFollowers = promotions
    .map((p) => p.followersGained)
    .filter((v): v is number => v !== null);

  const totalPromotionBudget = promotionBudgets.length > 0 ? sumNullable(promotionBudgets) : null;
  const totalPromotionFollowers =
    promotionFollowers.length > 0 ? sumNullable(promotionFollowers) : null;
  const costPerPromotionFollower =
    totalPromotionBudget !== null &&
    totalPromotionBudget > 0 &&
    totalPromotionFollowers !== null &&
    totalPromotionFollowers > 0
      ? safeDiv(totalPromotionBudget, totalPromotionFollowers)
      : null;

  const missingCriticalFields: string[] = [];
  if (updates.length === 0) missingCriticalFields.push('updates');
  if (views === null) missingCriticalFields.push('views');
  if (video.durationSeconds === null) missingCriticalFields.push('duration');
  if (video.tags.length === 0) missingCriticalFields.push('tags');

  return {
    video,
    latest,
    durationBucket: durationBucket(video.durationSeconds),
    promoted: promotions.length > 0,
    totalPromotionBudget,
    totalPromotionFollowers,
    costPerPromotionFollower,
    followersPer1kViews,
    likesPer1kViews,
    savesPer1kViews,
    commentsPer1kViews,
    repostsPer1kViews,
    engagementPer1kViews,
    dataQuality: {
      hasUpdates: updates.length > 0,
      hasViews: views !== null,
      hasFollowers: newFollowers !== null,
      hasDuration: video.durationSeconds !== null,
      hasTags: video.tags.length > 0,
      missingCriticalFields,
    },
  };
}

export function buildVideoReportRows(videosWithUpdates: VideoWithUpdates[]): VideoReportRow[] {
  return videosWithUpdates.map(buildVideoReportRow);
}

// ---------------------------------------------------------------------------
// Aggregate builders
// ---------------------------------------------------------------------------

function aggregateRows(key: string, label: string, rows: VideoReportRow[]): AggregateRow {
  return {
    key,
    label,
    videosCount: rows.length,
    medianViews: median(rows.map((r) => r.latest.views).filter((v): v is number => v !== null)),
    medianDepthPct: median(
      rows.map((r) => r.latest.depthPct).filter((v): v is number => v !== null),
    ),
    medianFollowersPer1kViews: median(
      rows.map((r) => r.followersPer1kViews).filter((v): v is number => v !== null),
    ),
    medianSavesPer1kViews: median(
      rows.map((r) => r.savesPer1kViews).filter((v): v is number => v !== null),
    ),
    medianRepostsPer1kViews: median(
      rows.map((r) => r.repostsPer1kViews).filter((v): v is number => v !== null),
    ),
    confidence: confidence(rows.length),
  };
}

export function aggregateByDuration(rows: VideoReportRow[]): AggregateRow[] {
  const buckets: DurationBucket[] = [
    '0-15s',
    '16-30s',
    '31-45s',
    '46-60s',
    '61-90s',
    '90s+',
    'unknown',
  ];
  return buckets
    .map((b) =>
      aggregateRows(
        b,
        b,
        rows.filter((r) => r.durationBucket === b),
      ),
    )
    .filter((r) => r.videosCount > 0);
}

export function aggregateByTag(rows: VideoReportRow[]): AggregateRow[] {
  const tagMap = new Map<string, VideoReportRow[]>();
  for (const row of rows) {
    for (const tag of row.video.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(row);
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, tagRows]) => aggregateRows(tag, tag, tagRows))
    .sort((a, b) => b.videosCount - a.videosCount);
}

type CreativeAttribute = 'hasFace' | 'hookType' | 'soundType' | 'subtitles';

export function aggregateByCreativeAttribute(
  rows: VideoReportRow[],
  attribute: CreativeAttribute,
): AggregateRow[] {
  const groupMap = new Map<string, VideoReportRow[]>();
  for (const row of rows) {
    const raw = row.video[attribute];
    const key = raw === null || raw === undefined ? 'unknown' : String(raw);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(row);
  }
  return Array.from(groupMap.entries())
    .map(([k, groupRows]) => aggregateRows(k, k, groupRows))
    .sort((a, b) => b.videosCount - a.videosCount);
}

// ---------------------------------------------------------------------------
// Next actions
// ---------------------------------------------------------------------------

export type ActionKind = 'double-down' | 'promote' | 'cut' | 'experiment' | 'data-quality' | 'risk';

export interface NextAction {
  id: string;
  kind: ActionKind;
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  relatedVideoId?: number;
  relatedVideoTitle?: string;
}

const ACTION_ORDER: ActionKind[] = [
  'data-quality',
  'double-down',
  'promote',
  'cut',
  'risk',
  'experiment',
];

export function buildNextActions(rows: VideoReportRow[]): NextAction[] {
  const actions: NextAction[] = [];

  // A. Data quality
  const withViewsAndFollowers = rows.filter(
    (r) => r.dataQuality.hasViews && r.dataQuality.hasFollowers,
  ).length;
  const total = rows.length;
  const pctNoUpdates = total > 0 ? rows.filter((r) => !r.dataQuality.hasUpdates).length / total : 0;
  const pctNoDuration =
    total > 0 ? rows.filter((r) => !r.dataQuality.hasDuration).length / total : 0;
  const pctNoTags = total > 0 ? rows.filter((r) => !r.dataQuality.hasTags).length / total : 0;

  const dataMissing: string[] = [];
  if (withViewsAndFollowers < 3) dataMissing.push('views and new followers');
  if (pctNoUpdates > 0.3) dataMissing.push('updates');
  if (pctNoDuration > 0.3) dataMissing.push('duration');
  if (pctNoTags > 0.3) dataMissing.push('tags');

  if (dataMissing.length > 0) {
    actions.push({
      id: 'data-quality',
      kind: 'data-quality',
      title: 'Improve your data first',
      body: `Recommendations are limited because some videos are missing: ${dataMissing.join(', ')}. Add updates and fill in video details to unlock better insights.`,
      priority: withViewsAndFollowers < 3 ? 'high' : 'medium',
    });
  }

  // Shared medians
  const allF1k = rows.map((r) => r.followersPer1kViews).filter((v): v is number => v !== null);
  const medianF1k = median(allF1k);

  // B. Double down
  const candidatesForBest = rows.filter(
    (r) => r.followersPer1kViews !== null && (r.latest.views ?? 0) > 0,
  );
  const highViewCandidates = candidatesForBest.filter((r) => (r.latest.views ?? 0) >= 100);
  const bestPool = highViewCandidates.length > 0 ? highViewCandidates : candidatesForBest;
  const bestRow =
    bestPool.length > 0
      ? bestPool.reduce((best, r) =>
          (r.followersPer1kViews ?? 0) > (best.followersPer1kViews ?? 0) ? r : best,
        )
      : null;

  if (bestRow && medianF1k !== null && (bestRow.followersPer1kViews ?? 0) >= medianF1k * 1.5) {
    const v = bestRow.video;
    const f1k = bestRow.followersPer1kViews!.toFixed(1);
    const dur = bestRow.durationBucket !== 'unknown' ? bestRow.durationBucket : 'unknown duration';
    const hook = v.hookType ?? 'no hook data';
    const sound = v.soundType ?? 'no sound data';
    const subs =
      v.subtitles === null ? 'subtitles unknown' : v.subtitles ? 'with subtitles' : 'no subtitles';
    const tags = v.tags.length > 0 ? v.tags.slice(0, 3).join(', ') : 'no tags';
    actions.push({
      id: 'double-down',
      kind: 'double-down',
      title: 'Repeat your best growth format',
      body: `Your best growth video is "${v.title}": ${f1k} followers per 1k views. Repeat its pattern: ${dur}, hook "${hook}", sound "${sound}", ${subs}, tags: ${tags}.`,
      priority: 'high',
      relatedVideoId: v.id,
      relatedVideoTitle: v.title,
    });
  }

  // C. Promote
  const promoteCandidates = rows.filter((r) => {
    if (r.promoted) return false;
    if (r.followersPer1kViews === null) return false;
    if (medianF1k !== null && r.followersPer1kViews < medianF1k * 1.25) return false;
    if (r.latest.depthPct !== null && r.latest.depthPct < 35) return false;
    return true;
  });
  const highViewPromote = promoteCandidates.filter((r) => (r.latest.views ?? 0) >= 100);
  const promotePool = highViewPromote.length > 0 ? highViewPromote : promoteCandidates;
  const promoteRow =
    promotePool.length > 0
      ? promotePool.reduce((best, r) =>
          (r.followersPer1kViews ?? 0) > (best.followersPer1kViews ?? 0) ? r : best,
        )
      : null;

  if (
    promoteRow &&
    promoteRow.video.id !== bestRow?.video.id &&
    promoteRow.followersPer1kViews !== null
  ) {
    actions.push({
      id: 'promote',
      kind: 'promote',
      title: 'Consider promoting this video',
      body: `"${promoteRow.video.title}" already converts organically: ${promoteRow.followersPer1kViews.toFixed(1)} followers per 1k views. Promote winners, not weak videos.`,
      priority: 'medium',
      relatedVideoId: promoteRow.video.id,
      relatedVideoTitle: promoteRow.video.title,
    });
  }

  // D. Cut
  const promotedWithCost = rows.filter((r) => r.costPerPromotionFollower !== null);
  const allCosts = promotedWithCost
    .map((r) => r.costPerPromotionFollower)
    .filter((v): v is number => v !== null);
  const medianCost = median(allCosts);
  if (medianCost !== null) {
    const cutRow =
      promotedWithCost
        .filter((r) => (r.costPerPromotionFollower ?? 0) > medianCost * 1.5)
        .sort((a, b) => (b.costPerPromotionFollower ?? 0) - (a.costPerPromotionFollower ?? 0))[0] ??
      null;
    if (cutRow && cutRow.costPerPromotionFollower !== null) {
      actions.push({
        id: 'cut',
        kind: 'cut',
        title: 'Stop scaling expensive promotions',
        body: `"${cutRow.video.title}" costs ${cutRow.costPerPromotionFollower.toFixed(2)} per follower, which is much higher than your median promoted video. Do not scale this format until organic conversion improves.`,
        priority: 'high',
        relatedVideoId: cutRow.video.id,
        relatedVideoTitle: cutRow.video.title,
      });
    }
  }

  // E. Risk
  const hateRows = rows.filter((r) => r.latest.hate === true);
  if (hateRows.length > 0 && medianF1k !== null) {
    const highViewsThreshold = median(
      rows.map((r) => r.latest.views).filter((v): v is number => v !== null),
    );
    const riskRow =
      hateRows.find(
        (r) =>
          (highViewsThreshold !== null && (r.latest.views ?? 0) > highViewsThreshold) ||
          (r.followersPer1kViews !== null && r.followersPer1kViews > medianF1k),
      ) ?? null;
    if (riskRow) {
      actions.push({
        id: 'risk',
        kind: 'risk',
        title: 'Watch quality of growth',
        body: `"${riskRow.video.title}" performs well, but has hate in comments. Treat it as risky growth: review comments before repeating or promoting.`,
        priority: 'medium',
        relatedVideoId: riskRow.video.id,
        relatedVideoTitle: riskRow.video.title,
      });
    }
  }

  // F. Experiment
  if (rows.length >= 3 && medianF1k !== null) {
    const tagAggs = aggregateByTag(rows);
    const tagHit = tagAggs.find(
      (agg) =>
        (agg.confidence === 'low' || agg.confidence === 'medium') &&
        agg.medianFollowersPer1kViews !== null &&
        agg.medianFollowersPer1kViews > medianF1k,
    );
    if (tagHit) {
      actions.push({
        id: `experiment-tag-${tagHit.key}`,
        kind: 'experiment',
        title: 'Run a controlled experiment',
        body: `Try 3 more videos with tag "${tagHit.label}". Early signal is promising (${tagHit.medianFollowersPer1kViews?.toFixed(1)} followers/1k views), but confidence is still ${tagHit.confidence}.`,
        priority: tagHit.confidence === 'medium' ? 'medium' : 'low',
      });
    } else {
      const creativeAttrs: Array<{
        attribute: 'hookType' | 'soundType' | 'subtitles';
        label: string;
      }> = [
        { attribute: 'hookType', label: 'hook' },
        { attribute: 'soundType', label: 'sound' },
        { attribute: 'subtitles', label: 'subtitles' },
      ];
      for (const { attribute, label } of creativeAttrs) {
        const aggs = aggregateByCreativeAttribute(rows, attribute);
        const hit = aggs.find(
          (agg) =>
            agg.key !== 'unknown' &&
            (agg.confidence === 'low' || agg.confidence === 'medium') &&
            agg.medianFollowersPer1kViews !== null &&
            agg.medianFollowersPer1kViews > medianF1k,
        );
        if (hit) {
          actions.push({
            id: `experiment-${attribute}-${hit.key}`,
            kind: 'experiment',
            title: 'Run a controlled experiment',
            body: `Try 3 more videos with ${label} "${hit.label}". Early signal is promising (${hit.medianFollowersPer1kViews?.toFixed(1)} followers/1k views), but confidence is still ${hit.confidence}.`,
            priority: hit.confidence === 'medium' ? 'medium' : 'low',
          });
          break;
        }
      }
    }
  }

  // Sort by kind order, cap at 5
  return actions
    .sort((a, b) => ACTION_ORDER.indexOf(a.kind) - ACTION_ORDER.indexOf(b.kind))
    .slice(0, 5);
}
