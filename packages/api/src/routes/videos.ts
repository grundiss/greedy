import type {
  HookType,
  GlobalUpdate,
  NewGlobalUpdateInput,
  NewUpdateInput,
  NewVideoInput,
  SoundType,
  Update,
  Video,
  VideoWithUpdates,
} from '@greedy/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { globalUpdates, updates, videos } from '../db/schema.js';
import type {
  GlobalUpdate as GlobalUpdateRow,
  Update as UpdateRow,
  Video as VideoRow,
} from '../db/schema.js';

function serializeVideo(row: VideoRow): Video {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationSeconds: row.durationSeconds,
    tags: row.tags,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    hasFace: row.hasFace,
    hookType: (row.hookType as Video['hookType']) ?? null,
    soundType: (row.soundType as Video['soundType']) ?? null,
    subtitles: row.subtitles,
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

function serializeGlobalUpdate(row: GlobalUpdateRow): GlobalUpdate {
  return {
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    followers: row.followers,
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

// Coerce an incoming value to a boolean, or null if absent.
function toBoolOrNull(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'yes' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 'no' || value === 0 || value === '0') return false;
  return null;
}

// Constrain a string to one of the allowed values, else null.
function toEnumOrNull<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const HOOK_TYPES: readonly HookType[] = ['none', 'question', 'result'];
const SOUND_TYPES: readonly SoundType[] = ['music', 'voice'];

// Parse a date-ish input to a Date, or null if absent/invalid.
function toDateOrNull(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  // Log an account-level update, such as the current follower count.
  app.post('/global-updates', async (request, reply): Promise<GlobalUpdate | undefined> => {
    const body = (request.body ?? {}) as NewGlobalUpdateInput;
    const followers = toIntOrNull(body.followers);
    if (followers === null || followers < 0) {
      reply.code(400);
      return reply.send({ error: 'BadRequest', message: 'followers is required' });
    }

    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      reply.code(400);
      return reply.send({ error: 'BadRequest', message: 'invalid recordedAt' });
    }

    const [row] = await app.db.insert(globalUpdates).values({ recordedAt, followers }).returning();

    reply.code(201);
    return serializeGlobalUpdate(row!);
  });

  // List account-level updates, oldest first.
  app.get('/global-updates', async (): Promise<GlobalUpdate[]> => {
    const rows = await app.db.select().from(globalUpdates).orderBy(asc(globalUpdates.recordedAt));
    return rows.map(serializeGlobalUpdate);
  });

  // List videos, newest first.
  app.get('/videos', async (): Promise<Video[]> => {
    const rows = await app.db.select().from(videos).orderBy(desc(videos.createdAt));
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

    const [row] = await app.db
      .insert(videos)
      .values({
        title,
        description: body.description?.trim() || null,
        durationSeconds: toIntOrNull(body.durationSeconds),
        tags: Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : [],
        publishedAt: toDateOrNull(body.publishedAt),
        hasFace: toBoolOrNull(body.hasFace),
        hookType: toEnumOrNull(body.hookType, HOOK_TYPES),
        soundType: toEnumOrNull(body.soundType, SOUND_TYPES),
        subtitles: toBoolOrNull(body.subtitles),
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
      const [video] = await app.db.select().from(videos).where(eq(videos.id, id));
      if (!video) {
        reply.code(404);
        return reply.send({ error: 'NotFound', message: 'video not found' });
      }
      const rows = await app.db
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
    await app.db.delete(videos).where(eq(videos.id, id));
    reply.code(204);
    return reply.send();
  });

  // Log a partial update: at least one metric required.
  app.post<{ Params: { id: string } }>(
    '/videos/:id/updates',
    async (request, reply): Promise<Update | undefined> => {
      const id = Number(request.params.id);
      const [video] = await app.db.select().from(videos).where(eq(videos.id, id));
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

      const [row] = await app.db
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
    const rows = await app.db
      .select()
      .from(updates)
      .where(eq(updates.videoId, id))
      .orderBy(asc(updates.recordedAt));
    return rows.map(serializeUpdate);
  });
}
