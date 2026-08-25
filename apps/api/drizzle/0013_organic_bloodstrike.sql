CREATE TABLE "progress_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD COLUMN "progress_status_id" uuid;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD COLUMN "on_way_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD COLUMN "reached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD COLUMN "helping_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD CONSTRAINT "mission_volunteers_progress_status_id_progress_statuses_id_fk" FOREIGN KEY ("progress_status_id") REFERENCES "public"."progress_statuses"("id") ON DELETE no action ON UPDATE no action;