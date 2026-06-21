import type {
  DbImportResult,
  GlobalUpdate,
  NewGlobalUpdateInput,
  NewUpdateInput,
  NewVideoInput,
  Update,
  Video,
  VideoWithUpdates,
} from '@greedy/shared';

// In the desktop shell the preload injects the embedded server's loopback URL
// (window.greedy.apiBaseUrl) — it changes whenever the backend restarts after a
// content update, so we read it on load of each freshly-created window. In the
// browser dev app there's no bridge, so fall back to the Vite env / localhost.
const API_URL =
  (typeof window !== 'undefined' && window.greedy?.apiBaseUrl) ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // non-JSON error body; keep default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as T;
}

export const api = {
  listGlobalUpdates: () => request<GlobalUpdate[]>('/global-updates'),
  addGlobalUpdate: (input: NewGlobalUpdateInput) =>
    request<GlobalUpdate>('/global-updates', { method: 'POST', body: JSON.stringify(input) }),
  listVideos: () => request<Video[]>('/videos'),
  getVideo: (id: number) => request<VideoWithUpdates>(`/videos/${id}`),
  createVideo: (input: NewVideoInput) =>
    request<Video>('/videos', { method: 'POST', body: JSON.stringify(input) }),
  deleteVideo: (id: number) => request<void>(`/videos/${id}`, { method: 'DELETE' }),
  exportDb: () => request<string>('/db/export'),
  importDb: (sql: string) =>
    request<DbImportResult>('/db/import', { method: 'POST', body: JSON.stringify({ sql }) }),
  addUpdate: (videoId: number, input: NewUpdateInput) =>
    request<Update>(`/videos/${videoId}/updates`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
