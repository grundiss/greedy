import type {
  HookType,
  GlobalUpdate,
  NewGlobalUpdateInput,
  NewPromotionInput,
  NewUpdateInput,
  NewVideoInput,
  Promotion,
  SoundType,
  UpdateVideoInput,
  Update,
  Video,
  VideoWithUpdates,
} from '@greedy/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { globalUpdates, promotions, updates, videos } from '../db/schema.js';
import type {
  GlobalUpdate as GlobalUpdateRow,
  Promotion as PromotionRow,
  Update as UpdateRow,
  Video as VideoRow,
} from '../db/schema.js';

export function serializeVideo(row: VideoRow): Video {
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

export function serializeUpdate(row: UpdateRow): Update {
  return {
    id: row.id,
    videoId: row.videoId,
    recordedAt: row.recordedAt.toISOString(),
    likes: row.likes,
    saves: row.saves,
    depthPct: row.depthPct,
    views: row.views,
    comments: row.comments,
    reposts: row.reposts,
    newFollowers: row.newFollowers,
    hate: row.hate,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeGlobalUpdate(row: GlobalUpdateRow): GlobalUpdate {
  return {
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    followers: row.followers,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializePromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    videoId: row.videoId,
    recordedAt: row.recordedAt.toISOString(),
    budget: row.budget,
    followersGained: row.followersGained,
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

function videoValuesFromInput(body: NewVideoInput | UpdateVideoInput) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return null;

  return {
    title,
    description: body.description?.trim() || null,
    durationSeconds: toIntOrNull(body.durationSeconds),
    tags: Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : [],
    publishedAt: toDateOrNull(body.publishedAt),
    hasFace: toBoolOrNull(body.hasFace),
    hookType: toEnumOrNull(body.hookType, HOOK_TYPES),
    soundType: toEnumOrNull(body.soundType, SOUND_TYPES),
    subtitles: toBoolOrNull(body.subtitles),
  };
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
    const values = videoValuesFromInput(body);
    if (!values) {
      reply.code(400);
      return reply.send({ error: 'BadRequest', message: 'title is required' });
    }

    const [row] = await app.db.insert(videos).values(values).returning();

    reply.code(201);
    return serializeVideo(row!);
  });

  // Edit video metadata.
  app.patch<{ Params: { id: string } }>(
    '/videos/:id',
    async (request, reply): Promise<Video | undefined> => {
      const id = Number(request.params.id);
      const [video] = await app.db.select().from(videos).where(eq(videos.id, id));
      if (!video) {
        reply.code(404);
        return reply.send({ error: 'NotFound', message: 'video not found' });
      }

      const body = (request.body ?? {}) as UpdateVideoInput;
      const values = videoValuesFromInput(body);
      if (!values) {
        reply.code(400);
        return reply.send({ error: 'BadRequest', message: 'title is required' });
      }

      const [row] = await app.db.update(videos).set(values).where(eq(videos.id, id)).returning();
      return serializeVideo(row!);
    },
  );

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
      const [updateRows, promotionRows] = await Promise.all([
        app.db
          .select()
          .from(updates)
          .where(eq(updates.videoId, id))
          .orderBy(asc(updates.recordedAt)),
        app.db
          .select()
          .from(promotions)
          .where(eq(promotions.videoId, id))
          .orderBy(asc(promotions.recordedAt)),
      ]);
      return {
        ...serializeVideo(video),
        updates: updateRows.map(serializeUpdate),
        promotions: promotionRows.map(serializePromotion),
      };
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
      const views = toIntOrNull(body.views);
      const comments = toIntOrNull(body.comments);
      const reposts = toIntOrNull(body.reposts);
      const newFollowers = toIntOrNull(body.newFollowers);
      const hate = toBoolOrNull(body.hate);

      // `hate` is a flag, not a metric — it can't stand on its own.
      if (
        likes === null &&
        saves === null &&
        depthPct === null &&
        views === null &&
        comments === null &&
        reposts === null &&
        newFollowers === null
      ) {
        reply.code(400);
        return reply.send({
          error: 'BadRequest',
          message: 'provide at least one metric',
        });
      }

      const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
      if (Number.isNaN(recordedAt.getTime())) {
        reply.code(400);
        return reply.send({ error: 'BadRequest', message: 'invalid recordedAt' });
      }

      const [row] = await app.db
        .insert(updates)
        .values({
          videoId: id,
          recordedAt,
          likes,
          saves,
          depthPct,
          views,
          comments,
          reposts,
          newFollowers,
          hate,
        })
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

  // Log an ad campaign for a video: budget and/or the followers it drove.
  app.post<{ Params: { id: string } }>(
    '/videos/:id/promotions',
    async (request, reply): Promise<Promotion | undefined> => {
      const id = Number(request.params.id);
      const [video] = await app.db.select().from(videos).where(eq(videos.id, id));
      if (!video) {
        reply.code(404);
        return reply.send({ error: 'NotFound', message: 'video not found' });
      }

      const body = (request.body ?? {}) as NewPromotionInput;
      const budget = toIntOrNull(body.budget);
      const followersGained = toIntOrNull(body.followersGained);

      if (budget === null && followersGained === null) {
        reply.code(400);
        return reply.send({
          error: 'BadRequest',
          message: 'provide at least one of budget, followersGained',
        });
      }

      const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
      if (Number.isNaN(recordedAt.getTime())) {
        reply.code(400);
        return reply.send({ error: 'BadRequest', message: 'invalid recordedAt' });
      }

      const [row] = await app.db
        .insert(promotions)
        .values({ videoId: id, recordedAt, budget, followersGained })
        .returning();

      reply.code(201);
      return serializePromotion(row!);
    },
  );

  // List ad campaigns for a video, oldest first.
  app.get<{ Params: { id: string } }>(
    '/videos/:id/promotions',
    async (request): Promise<Promotion[]> => {
      const id = Number(request.params.id);
      const rows = await app.db
        .select()
        .from(promotions)
        .where(eq(promotions.videoId, id))
        .orderBy(asc(promotions.recordedAt));
      return rows.map(serializePromotion);
    },
  );
}
