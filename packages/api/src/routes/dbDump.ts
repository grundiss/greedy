import type { DbExportPayload, GlobalUpdate, Update, Video } from '@greedy/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { globalUpdates, updates, videos } from '../db/schema.js';
import { serializeGlobalUpdate, serializeUpdate, serializeVideo } from './videos.js';

const DUMP_VERSION = 1;
const PAYLOAD_PREFIX = '-- greedy-data: ';

function escapeSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlValue(value: string | number | boolean | null | string[]): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (Array.isArray(value)) return `ARRAY[${value.map(escapeSqlString).join(', ')}]::text[]`;
  return escapeSqlString(value);
}

function chunkBase64(value: string): string[] {
  return value.match(/.{1,1000}/g) ?? [];
}

function encodePayload(payload: DbExportPayload): string[] {
  return chunkBase64(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')).map(
    (chunk) => `${PAYLOAD_PREFIX}${chunk}`,
  );
}

function decodePayload(dump: string): DbExportPayload | null {
  const encoded = dump
    .split(/\r?\n/)
    .filter((line) => line.startsWith(PAYLOAD_PREFIX))
    .map((line) => line.slice(PAYLOAD_PREFIX.length).trim())
    .join('');
  if (!encoded) return null;
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as DbExportPayload;
}

function renderDump(payload: DbExportPayload): string {
  const lines = [
    '-- Greedy database export',
    `-- Created at: ${payload.exportedAt}`,
    '-- Import through Greedy Settings. The greedy-data lines preserve a lossless app-native payload.',
    ...encodePayload(payload),
    '',
    'BEGIN;',
    'TRUNCATE TABLE updates, global_updates, videos RESTART IDENTITY CASCADE;',
  ];

  for (const video of payload.videos) {
    lines.push(
      `INSERT INTO videos (id, title, description, duration_seconds, tags, published_at, has_face, hook_type, sound_type, subtitles, created_at) VALUES (${[
        video.id,
        video.title,
        video.description,
        video.durationSeconds,
        video.tags,
        video.publishedAt,
        video.hasFace,
        video.hookType,
        video.soundType,
        video.subtitles,
        video.createdAt,
      ]
        .map(sqlValue)
        .join(', ')});`,
    );
  }

  for (const update of payload.updates) {
    lines.push(
      `INSERT INTO updates (id, video_id, recorded_at, likes, saves, depth_pct, created_at) VALUES (${[
        update.id,
        update.videoId,
        update.recordedAt,
        update.likes,
        update.saves,
        update.depthPct,
        update.createdAt,
      ]
        .map(sqlValue)
        .join(', ')});`,
    );
  }

  for (const globalUpdate of payload.globalUpdates) {
    lines.push(
      `INSERT INTO global_updates (id, recorded_at, followers, created_at) VALUES (${[
        globalUpdate.id,
        globalUpdate.recordedAt,
        globalUpdate.followers,
        globalUpdate.createdAt,
      ]
        .map(sqlValue)
        .join(', ')});`,
    );
  }

  lines.push(
    "SELECT setval(pg_get_serial_sequence('videos', 'id'), COALESCE((SELECT MAX(id) FROM videos), 1), (SELECT COUNT(*) > 0 FROM videos));",
    "SELECT setval(pg_get_serial_sequence('updates', 'id'), COALESCE((SELECT MAX(id) FROM updates), 1), (SELECT COUNT(*) > 0 FROM updates));",
    "SELECT setval(pg_get_serial_sequence('global_updates', 'id'), COALESCE((SELECT MAX(id) FROM global_updates), 1), (SELECT COUNT(*) > 0 FROM global_updates));",
    'COMMIT;',
    '',
  );
  return lines.join('\n');
}

function requireArray<T>(value: T[] | undefined, name: string): T[] {
  if (!Array.isArray(value)) throw new Error(`missing ${name}`);
  return value;
}

export async function dbDumpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/db/export', async (_request, reply) => {
    const [videoRows, updateRows, globalUpdateRows] = await Promise.all([
      app.db.select().from(videos),
      app.db.select().from(updates),
      app.db.select().from(globalUpdates),
    ]);
    const payload: DbExportPayload = {
      version: DUMP_VERSION,
      exportedAt: new Date().toISOString(),
      videos: videoRows.map(serializeVideo),
      updates: updateRows.map(serializeUpdate),
      globalUpdates: globalUpdateRows.map(serializeGlobalUpdate),
    };
    reply.header('Content-Type', 'application/sql; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="greedy-${payload.exportedAt.slice(0, 10)}.sql"`,
    );
    return renderDump(payload);
  });

  app.post('/db/import', async (request, reply) => {
    const body = request.body as { sql?: string } | undefined;
    const dump = body?.sql;
    if (typeof dump !== 'string' || !dump.trim()) {
      reply.code(400);
      return reply.send({ error: 'BadRequest', message: 'sql dump is required' });
    }

    let payload: DbExportPayload | null;
    try {
      payload = decodePayload(dump);
      if (!payload || payload.version !== DUMP_VERSION) throw new Error('unsupported dump format');
      requireArray(payload.videos, 'videos');
      requireArray(payload.updates, 'updates');
      requireArray(payload.globalUpdates, 'globalUpdates');
    } catch {
      reply.code(400);
      return reply.send({ error: 'BadRequest', message: 'unsupported Greedy SQL dump' });
    }

    await app.db.transaction(async (tx) => {
      await tx.delete(updates);
      await tx.delete(globalUpdates);
      await tx.delete(videos);
      if (payload.videos.length) {
        await tx.insert(videos).values(
          payload.videos.map((video) => ({
            id: video.id,
            title: video.title,
            description: video.description,
            durationSeconds: video.durationSeconds,
            tags: video.tags,
            publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
            hasFace: video.hasFace,
            hookType: video.hookType,
            soundType: video.soundType,
            subtitles: video.subtitles,
            createdAt: new Date(video.createdAt),
          })),
        );
      }
      if (payload.updates.length) {
        await tx.insert(updates).values(
          payload.updates.map((update) => ({
            id: update.id,
            videoId: update.videoId,
            recordedAt: new Date(update.recordedAt),
            likes: update.likes,
            saves: update.saves,
            depthPct: update.depthPct,
            createdAt: new Date(update.createdAt),
          })),
        );
      }
      if (payload.globalUpdates.length) {
        await tx.insert(globalUpdates).values(
          payload.globalUpdates.map((globalUpdate) => ({
            id: globalUpdate.id,
            recordedAt: new Date(globalUpdate.recordedAt),
            followers: globalUpdate.followers,
            createdAt: new Date(globalUpdate.createdAt),
          })),
        );
      }
      await tx.execute(
        sql.raw(
          "SELECT setval(pg_get_serial_sequence('videos', 'id'), COALESCE((SELECT MAX(id) FROM videos), 1), (SELECT COUNT(*) > 0 FROM videos))",
        ),
      );
      await tx.execute(
        sql.raw(
          "SELECT setval(pg_get_serial_sequence('updates', 'id'), COALESCE((SELECT MAX(id) FROM updates), 1), (SELECT COUNT(*) > 0 FROM updates))",
        ),
      );
      await tx.execute(
        sql.raw(
          "SELECT setval(pg_get_serial_sequence('global_updates', 'id'), COALESCE((SELECT MAX(id) FROM global_updates), 1), (SELECT COUNT(*) > 0 FROM global_updates))",
        ),
      );
    });

    return {
      imported: {
        videos: payload.videos.length,
        updates: payload.updates.length,
        globalUpdates: payload.globalUpdates.length,
      },
    };
  });
}
