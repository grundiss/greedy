import type { Video } from '@greedy/shared';
import { useEffect, useMemo, useState } from 'react';
import { Card, TextInput } from '../components/ui';
import { api } from '../lib/api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatBool(value: boolean | null): string {
  if (value === null) return '—';
  return value ? 'Yes' : 'No';
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}s`;
}

export function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listVideos()
      .then(setVideos)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load videos'));
  }, []);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return videos;

    return videos.filter((video) => {
      const searchable = [video.title, video.description ?? '', ...video.tags]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [query, videos]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Videos</h2>
          <p className="mt-1 text-slate-500">Browse and search your full content catalog.</p>
        </div>
        <div className="w-80">
          <TextInput
            type="search"
            placeholder="Search title, description, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        {filteredVideos.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {videos.length === 0
              ? 'No videos yet. Add one from Input.'
              : 'No videos match your search.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full table-fixed border-collapse bg-white text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-[30%] px-4 py-3 font-semibold">Video</th>
                  <th className="px-4 py-3 font-semibold">Published</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Tags</th>
                  <th className="px-4 py-3 font-semibold">Attributes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredVideos.map((video) => (
                  <tr key={video.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-900">{video.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {video.description || 'No description'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(video.publishedAt)}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDuration(video.durationSeconds)}
                    </td>
                    <td className="px-4 py-4">
                      {video.tags.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {video.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      <div>Face: {formatBool(video.hasFace)}</div>
                      <div>Hook: {video.hookType ?? '—'}</div>
                      <div>Sound: {video.soundType ?? '—'}</div>
                      <div>Subtitles: {formatBool(video.subtitles)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
