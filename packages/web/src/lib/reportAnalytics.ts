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
