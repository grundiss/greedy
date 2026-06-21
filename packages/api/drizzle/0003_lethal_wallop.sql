CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"budget" integer,
	"followers_gained" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "views" integer;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "comments" integer;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "reposts" integer;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "new_followers" integer;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "hate" boolean;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;