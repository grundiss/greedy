ALTER TABLE "videos" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "has_face" boolean;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hook_type" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "sound_type" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "subtitles" boolean;