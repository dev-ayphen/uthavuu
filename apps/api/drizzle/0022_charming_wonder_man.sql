CREATE TABLE "sponsor_creative_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_creative_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sponsor_placements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sponsor_id" uuid NOT NULL,
	"placement_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_placements_sponsor_placement_key" UNIQUE("sponsor_id","placement_key")
);
--> statement-breakpoint
CREATE TABLE "sponsor_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"description" text,
	"website" text,
	"category" text,
	"campaign_name" text,
	"location" text,
	"creative_type_id" uuid NOT NULL,
	"creative_url" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sponsor_placements" ADD CONSTRAINT "sponsor_placements_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_creative_type_id_sponsor_creative_types_id_fk" FOREIGN KEY ("creative_type_id") REFERENCES "public"."sponsor_creative_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_status_id_sponsor_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."sponsor_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_placements_placement_key_idx" ON "sponsor_placements" USING btree ("placement_key");--> statement-breakpoint
CREATE INDEX "sponsors_status_window_idx" ON "sponsors" USING btree ("status_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "sponsors_created_at_idx" ON "sponsors" USING btree ("created_at");