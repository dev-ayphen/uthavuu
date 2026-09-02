CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"app_name" text DEFAULT 'Uthavu' NOT NULL,
	"support_email" text,
	"support_phone" text,
	"max_photos_per_report" integer DEFAULT 4 NOT NULL,
	"max_volunteers_per_report" integer DEFAULT 20 NOT NULL,
	"default_radius_km" integer DEFAULT 5 NOT NULL,
	"allow_anonymous_reports" boolean DEFAULT true NOT NULL,
	"comments_enabled" boolean DEFAULT true NOT NULL,
	"comment_flagging_enabled" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"read_only_mode" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_singleton_key" UNIQUE("singleton"),
	CONSTRAINT "platform_settings_singleton_true" CHECK ("platform_settings"."singleton"),
	CONSTRAINT "platform_settings_app_name_length" CHECK (char_length("platform_settings"."app_name") between 1 and 80),
	CONSTRAINT "platform_settings_max_photos_range" CHECK ("platform_settings"."max_photos_per_report" between 1 and 10),
	CONSTRAINT "platform_settings_max_volunteers_range" CHECK ("platform_settings"."max_volunteers_per_report" between 1 and 50),
	CONSTRAINT "platform_settings_default_radius_km_allowed" CHECK ("platform_settings"."default_radius_km" in (1, 3, 5, 10))
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;