CREATE TABLE "global_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"followers" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
