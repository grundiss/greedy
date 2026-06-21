// Types and utilities shared between the API and the web frontend.

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Domain DTOs (dates are ISO strings over the wire)
// ---------------------------------------------------------------------------

export type HookType = 'none' | 'question' | 'result';
export type SoundType = 'music' | 'voice';

export interface Video {
  id: number;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  tags: string[];
  publishedAt: string | null;
  hasFace: boolean | null;
  hookType: HookType | null;
  soundType: SoundType | null;
  subtitles: boolean | null;
  createdAt: string;
}

export interface NewVideoInput {
  title: string;
  description?: string | null;
  durationSeconds?: number | null;
  tags?: string[];
  publishedAt?: string | null;
  hasFace?: boolean | null;
  hookType?: HookType | null;
  soundType?: SoundType | null;
  subtitles?: boolean | null;
}

export type UpdateVideoInput = NewVideoInput;

export interface Update {
  id: number;
  videoId: number;
  recordedAt: string;
  likes: number | null;
  saves: number | null;
  depthPct: number | null;
  views: number | null;
  comments: number | null;
  reposts: number | null;
  newFollowers: number | null;
  hate: boolean | null;
  createdAt: string;
}

export interface GlobalUpdate {
  id: number;
  recordedAt: string;
  followers: number;
  createdAt: string;
}

// A paid ad campaign promoting a single video. `budget` and `followersGained`
// are both nullable — a bare row just records that the video was promoted.
export interface Promotion {
  id: number;
  videoId: number;
  recordedAt: string;
  budget: number | null;
  followersGained: number | null;
  createdAt: string;
}

// A partial update: at least one metric must be present. `recordedAt` defaults
// to "now" on the server when omitted.
export interface NewUpdateInput {
  recordedAt?: string;
  likes?: number | null;
  saves?: number | null;
  depthPct?: number | null;
  views?: number | null;
  comments?: number | null;
  reposts?: number | null;
  newFollowers?: number | null;
  hate?: boolean | null;
}

export interface NewGlobalUpdateInput {
  recordedAt?: string;
  followers: number;
}

// Log an ad campaign. `recordedAt` defaults to "now" when omitted; provide at
// least one of `budget` / `followersGained`.
export interface NewPromotionInput {
  recordedAt?: string;
  budget?: number | null;
  followersGained?: number | null;
}

export interface VideoWithUpdates extends Video {
  updates: Update[];
  promotions: Promotion[];
}

export interface DbExportPayload {
  version: number;
  exportedAt: string;
  videos: Video[];
  updates: Update[];
  globalUpdates: GlobalUpdate[];
  promotions: Promotion[];
}

export interface DbImportResult {
  imported: {
    videos: number;
    updates: number;
    globalUpdates: number;
    promotions: number;
  };
}
