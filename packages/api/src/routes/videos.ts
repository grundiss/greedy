import type {
  NewUpdateInput,
  NewVideoInput,
  Update,
  Video,
  VideoWithUpdates,
} from '@greedy/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { updates, videos } from '../db/schema.js';
import type { Update as UpdateRow, Video as VideoRow } from '../db/schema.js';

function serializeVideo(row: VideoRow): Video {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationSeconds: row.durationSeconds,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeUpdate(row: UpdateRow): Update {
  return {
    id: row.id,
    videoId: row.videoId,
    recordedAt: row.recordedAt.toISOString(),
    likes: row.likes,
    saves: row.saves,
    depthPct: row.depthPct,
    createdAt: row.createdAt.toISOString(),
  };
}

// Coerce an incoming value to an integer, or null if absent/blank/invalid.
function toIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  // List videos, newest first.
  app.get('/videos', async (): Promise<Video[]> => {
    const rows = await db.select().from(videos).orderBy(desc(videos.createdAt));
    return rows.map(serializeVideo);
  });

  // Create a video.
  app.post('/videos', async (request, reply): Promise<Video | undefined> => {
    const body = (request.body ?? {}) as NewVideoInput;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      reply.code(400);
      return reply.send({ error: 'BadRequest', message: 'title is required' });
    }

    const [row] = await db
      .insert(videos)
      .values({
        title,
        description: body.description?.trim() || null,
        durationSeconds: toIntOrNull(body.durationSeconds),
        tags: Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : [],
      })
      .returning();

    reply.code(201);
    return serializeVideo(row!);
  });

  // Get a single video with its full time series (for reports).
  app.get<{ Params: { id: string } }>(
    '/videos/:id',
    async (request, reply): Promise<VideoWithUpdates | undefined> => {
      const id = Number(request.params.id);
      const [video] = await db.select().from(videos).where(eq(videos.id, id));
      if (!video) {
        reply.code(404);
        return reply.send({ error: 'NotFound', message: 'video not found' });
      }
      const rows = await db
        .select()
        .from(updates)
        .where(eq(updates.videoId, id))
        .orderBy(asc(updates.recordedAt));
      return { ...serializeVideo(video), updates: rows.map(serializeUpdate) };
    },
  );

  // Delete a video (cascades to its updates).
  app.delete<{ Params: { id: string } }>('/videos/:id', async (request, reply) => {
    const id = Number(request.params.id);
    await db.delete(videos).where(eq(videos.id, id));
    reply.code(204);
    return reply.send();
  });

  // Log a partial update: at least one metric required.
  app.post<{ Params: { id: string } }>(
    '/videos/:id/updates',
    async (request, reply): Promise<Update | undefined> => {
      const id = Number(request.params.id);
      const [video] = await db.select().from(videos).where(eq(videos.id, id));
      if (!video) {
        reply.code(404);
        return reply.send({ error: 'NotFound', message: 'video not found' });
      }

      const body = (request.body ?? {}) as NewUpdateInput;
      const likes = toIntOrNull(body.likes);
      const saves = toIntOrNull(body.saves);
      let depthPct = toIntOrNull(body.depthPct);
      if (depthPct !== null) depthPct = clamp(depthPct, 0, 100);

      if (likes === null && saves === null && depthPct === null) {
        reply.code(400);
        return reply.send({
          error: 'BadRequest',
          message: 'provide at least one of likes, saves, depthPct',
        });
      }

      const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
      if (Number.isNaN(recordedAt.getTime())) {
        reply.code(400);
        return reply.send({ error: 'BadRequest', message: 'invalid recordedAt' });
      }

      const [row] = await db
        .insert(updates)
        .values({ videoId: id, recordedAt, likes, saves, depthPct })
        .returning();

      reply.code(201);
      return serializeUpdate(row!);
    },
  );

  // List updates for a video, oldest first.
  app.get<{ Params: { id: string } }>('/videos/:id/updates', async (request): Promise<Update[]> => {
    const id = Number(request.params.id);
    const rows = await db
      .select()
      .from(updates)
      .where(eq(updates.videoId, id))
      .orderBy(asc(updates.recordedAt));
    return rows.map(serializeUpdate);
  });
}
