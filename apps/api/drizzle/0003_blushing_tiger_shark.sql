CREATE TABLE "mission_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mission_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_volunteer_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_volunteer_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "mission_volunteers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mission_id" uuid NOT NULL,
	"volunteer_id" text NOT NULL,
	"status_id" uuid NOT NULL,
	"confirm_deadline" timestamp with time zone NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" text
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missions_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "needed_volunteers" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_messages" ADD CONSTRAINT "mission_messages_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_messages" ADD CONSTRAINT "mission_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD CONSTRAINT "mission_volunteers_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD CONSTRAINT "mission_volunteers_volunteer_id_user_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD CONSTRAINT "mission_volunteers_status_id_mission_volunteer_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."mission_volunteer_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_messages_mission_id_idx" ON "mission_messages" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "mission_volunteers_mission_id_idx" ON "mission_volunteers" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "mission_volunteers_volunteer_id_idx" ON "mission_volunteers" USING btree ("volunteer_id");