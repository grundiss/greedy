import type {
  NewUpdateInput,
  NewVideoInput,
  Update,
  Video,
  VideoWithUpdates,
} from '@greedy/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  return (await res.json()) as T;
}

export const api = {
  listVideos: () => request<Video[]>('/videos'),
  getVideo: (id: number) => request<VideoWithUpdates>(`/videos/${id}`),
  createVideo: (input: NewVideoInput) =>
    request<Video>('/videos', { method: 'POST', body: JSON.stringify(input) }),
  deleteVideo: (id: number) => request<void>(`/videos/${id}`, { method: 'DELETE' }),
  addUpdate: (videoId: number, input: NewUpdateInput) =>
    request<Update>(`/videos/${videoId}/updates`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
