ALTER TABLE "reports" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;