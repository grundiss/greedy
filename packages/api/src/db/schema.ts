import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// A TikTok video we want to track over time.
export const videos = pgTable('videos', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  durationSeconds: integer('duration_seconds'),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'`),
  // Editorial attributes of the video itself.
  publishedAt: timestamp('published_at', { withTimezone: true }),
  hasFace: boolean('has_face'),
  hookType: text('hook_type'), // 'none' | 'question' | 'result'
  soundType: text('sound_type'), // 'music' | 'voice'
  subtitles: boolean('subtitles'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A timestamped, partial snapshot of a video's metrics. Every metric is
// nullable so an update can carry just one value (e.g. only `likes`).
export const updates = pgTable('updates', {
  id: serial('id').primaryKey(),
  videoId: integer('video_id')
    .notNull()
    .references(() => videos.id, { onDelete: 'cascade' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  likes: integer('likes'),
  saves: integer('saves'),
  depthPct: integer('depth_pct'),
  views: integer('views'),
  comments: integer('comments'),
  reposts: integer('reposts'),
  newFollowers: integer('new_followers'),
  hate: boolean('hate'), // whether hateful comments showed up by this snapshot
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Update = typeof updates.$inferSelect;
export type NewUpdate = typeof updates.$inferInsert;

// A paid ad campaign promoting one video. A row simply records that the video
// was promoted; `budget` and `followersGained` are the (nullable) details.
export const promotions = pgTable('promotions', {
  id: serial('id').primaryKey(),
  videoId: integer('video_id')
    .notNull()
    .references(() => videos.id, { onDelete: 'cascade' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  budget: integer('budget'),
  followersGained: integer('followers_gained'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;

// A timestamped snapshot of account-level metrics that are not tied to one video.
export const globalUpdates = pgTable('global_updates', {
  id: serial('id').primaryKey(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  followers: integer('followers').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GlobalUpdate = typeof globalUpdates.$inferSelect;
export type NewGlobalUpdate = typeof globalUpdates.$inferInsert;
