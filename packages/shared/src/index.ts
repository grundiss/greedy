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

export interface Video {
  id: number;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  tags: string[];
  createdAt: string;
}

export interface NewVideoInput {
  title: string;
  description?: string | null;
  durationSeconds?: number | null;
  tags?: string[];
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
