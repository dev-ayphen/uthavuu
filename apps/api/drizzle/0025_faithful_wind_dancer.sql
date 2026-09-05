CREATE TABLE "photo_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploader_id" text,
	"status_id" uuid NOT NULL,
	"category_id" uuid,
	"stored_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"phash" text NOT NULL,
	"decision" text,
	"risk_level" text,
	"reasons" jsonb,
	"signals" jsonb,
	"provider" text,
	"moderation_model_version" text,
	"label_model_version" text,
	"unavailable_reason" text,
	"verified_at" timestamp with time zone,
	"report_id" uuid,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_verification_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_verification_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "report_categories" ADD COLUMN "expected_labels" jsonb;--> statement-breakpoint
ALTER TABLE "report_photos" ADD COLUMN "upload_id" uuid;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_status_id_photo_verification_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."photo_verification_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_category_id_report_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."report_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_uploads_uploader_id_idx" ON "photo_uploads" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "photo_uploads_status_id_idx" ON "photo_uploads" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "photo_uploads_sha256_idx" ON "photo_uploads" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "photo_uploads_report_id_idx" ON "photo_uploads" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "photo_uploads_created_at_idx" ON "photo_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "report_photos_upload_id_idx" ON "report_photos" USING btree ("upload_id");