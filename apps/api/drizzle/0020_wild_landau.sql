CREATE TABLE "community_update_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_update_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "community_updates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title_en" text NOT NULL,
	"body_en" text NOT NULL,
	"title_ta" text,
	"body_ta" text,
	"status_id" uuid NOT NULL,
	"publish_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"author_admin_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "community_updates" ADD CONSTRAINT "community_updates_status_id_community_update_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."community_update_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_updates" ADD CONSTRAINT "community_updates_author_admin_user_id_user_id_fk" FOREIGN KEY ("author_admin_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_updates_status_publish_at_idx" ON "community_updates" USING btree ("status_id","publish_at");--> statement-breakpoint
CREATE INDEX "community_updates_created_at_idx" ON "community_updates" USING btree ("created_at");