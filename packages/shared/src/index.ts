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

export interface Update {
  id: number;
  videoId: number;
  recordedAt: string;
  likes: number | null;
  saves: number | null;
  depthPct: number | null;
  createdAt: string;
}

// A partial update: at least one metric must be present. `recordedAt` defaults
// to "now" on the server when omitted.
export interface NewUpdateInput {
  recordedAt?: string;
  likes?: number | null;
  saves?: number | null;
  depthPct?: number | null;
}

export interface VideoWithUpdates extends Video {
  updates: Update[];
}
