import type { Video, VideoWithUpdates } from '@greedy/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, TextInput, Button, Modal, IconButton } from '../components/ui';
import { VideoForm } from '../components/VideoForm';
import { api } from '../lib/api';

function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function ReportIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function HistoryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function formatMetric(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value}${suffix}`;
}

export function VideosPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [eventsVideo, setEventsVideo] = useState<VideoWithUpdates | null>(null);
  const [eventsVideoTitle, setEventsVideoTitle] = useState('');
  const [isEventsDialogOpen, setIsEventsDialogOpen] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const closeEventsDialog = useCallback(() => {
    setIsEventsDialogOpen(false);
    setEventsVideo(null);
    setEventsVideoTitle('');
    setEventsError(null);
    setEventsLoading(false);
  }, []);

  const openEventsDialog = useCallback(async (video: Video) => {
    setEventsVideoTitle(video.title);
    setEventsVideo(null);
    setEventsError(null);
    setIsEventsDialogOpen(true);
    setEventsLoading(true);

    try {
      setEventsVideo(await api.getVideo(video.id));
    } catch (e: unknown) {
      setEventsError(e instanceof Error ? e.message : 'Failed to load updates');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const refreshVideos = useCallback(async () => {
    try {
      const nextVideos = await api.listVideos();
      setVideos(nextVideos);
      setError(null);
      setEditingVideo((current) =>
        current ? (nextVideos.find((video) => video.id === current.id) ?? null) : null,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load videos');
    }
  }, []);

  useEffect(() => {
    void refreshVideos();
  }, [refreshVideos]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      if (isDialogOpen) {
        setIsDialogOpen(false);
        setEditingVideo(null);
      }

      if (isEventsDialogOpen) closeEventsDialog();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeEventsDialog, isDialogOpen, isEventsDialogOpen]);

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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Videos</h2>
          <p className="mt-1 text-slate-500">Browse, add, and edit your content catalog.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-[240px] flex-1">
            <TextInput
              type="search"
              placeholder="Search title, description, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-auto">
            <Button
              type="button"
              onClick={() => {
                setEditingVideo(null);
                setIsDialogOpen(true);
              }}
            >
              Add video
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        {filteredVideos.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {videos.length === 0 ? 'No videos yet. Add one here.' : 'No videos match your search.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full table-fixed border-collapse bg-white text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-[28%] px-4 py-3 font-semibold">Video</th>
                  <th className="px-4 py-3 font-semibold">Published</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Tags</th>
                  <th className="px-4 py-3 font-semibold">Attributes</th>
                  <th className="w-40 px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredVideos.map((video) => (
                  <tr
                    key={video.id}
                    className={`align-top hover:bg-slate-50 ${
                      editingVideo?.id === video.id ? 'bg-indigo-50/60' : ''
                    }`}
                  >
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
                        <span className="text-slate-400">-</span>
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
                      <div>Hook: {video.hookType ?? '-'}</div>
                      <div>Sound: {video.soundType ?? '-'}</div>
                      <div>Subtitles: {formatBool(video.subtitles)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <IconButton
                          icon={<EditIcon className="h-4 w-4" />}
                          label="Edit video"
                          onClick={() => {
                            setEditingVideo(video);
                            setIsDialogOpen(true);
                          }}
                        />
                        <IconButton
                          icon={<ReportIcon className="h-4 w-4" />}
                          label="View report"
                          onClick={() => navigate(`/reports?videoId=${video.id}`)}
                        />
                        <IconButton
                          icon={<HistoryIcon className="h-4 w-4" />}
                          label="View updates log"
                          onClick={() => void openEventsDialog(video)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingVideo(null);
        }}
      >
        <VideoForm
          video={editingVideo}
          onSaved={(savedVideo) => {
            setIsDialogOpen(false);
            setEditingVideo(null);
            setVideos((current) => {
              const exists = current.some((video) => video.id === savedVideo.id);
              return exists
                ? current.map((video) => (video.id === savedVideo.id ? savedVideo : video))
                : [savedVideo, ...current];
            });
            void refreshVideos();
          }}
          onCancelEdit={() => {
            setIsDialogOpen(false);
            setEditingVideo(null);
          }}
        />
      </Modal>

      <Modal open={isEventsDialogOpen} onClose={closeEventsDialog}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Registered updates</h2>
              <p className="mt-1 text-sm text-slate-500">{eventsVideoTitle}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-3 py-1.5"
              onClick={closeEventsDialog}
            >
              Close
            </Button>
          </div>

          {eventsError ? <p className="text-sm text-red-600">{eventsError}</p> : null}

          {eventsLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">Loading updates…</p>
          ) : eventsVideo && eventsVideo.updates.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No registered updates for this video yet.
            </p>
          ) : eventsVideo ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full border-collapse bg-white text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Recorded</th>
                    <th className="px-4 py-3 font-semibold">Likes</th>
                    <th className="px-4 py-3 font-semibold">Saves</th>
                    <th className="px-4 py-3 font-semibold">Watch depth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {eventsVideo.updates.map((update) => (
                    <tr key={update.id}>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateTime(update.recordedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatMetric(update.likes)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatMetric(update.saves)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMetric(update.depthPct, '%')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
