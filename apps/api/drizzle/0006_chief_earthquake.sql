CREATE TABLE "mission_completion_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_completion_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "mission_completions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mission_id" uuid NOT NULL,
	"completed_by_id" text NOT NULL,
	"photo_url" text NOT NULL,
	"note" text NOT NULL,
	"status_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "mission_completions_mission_id_unique" UNIQUE("mission_id")
);
--> statement-breakpoint
ALTER TABLE "mission_completions" ADD CONSTRAINT "mission_completions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_completions" ADD CONSTRAINT "mission_completions_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_completions" ADD CONSTRAINT "mission_completions_status_id_mission_completion_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."mission_completion_statuses"("id") ON DELETE no action ON UPDATE no action;