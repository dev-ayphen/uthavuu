CREATE TABLE "broadcast_audiences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_audiences_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "broadcast_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title_en" text NOT NULL,
	"body_en" text NOT NULL,
	"title_ta" text,
	"body_ta" text,
	"status_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"district" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_count" integer,
	"delivered_count" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_status_id_broadcast_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."broadcast_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_audience_id_broadcast_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."broadcast_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcasts_status_created_at_idx" ON "broadcasts" USING btree ("status_id","created_at");--> statement-breakpoint
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "broadcasts_scheduled_at_idx" ON "broadcasts" USING btree ("scheduled_at");