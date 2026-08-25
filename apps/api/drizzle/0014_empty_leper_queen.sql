ALTER TABLE "report_comments" DROP CONSTRAINT "report_comments_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "mission_completions" DROP CONSTRAINT "mission_completions_completed_by_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "mission_messages" DROP CONSTRAINT "mission_messages_sender_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "mission_volunteers" DROP CONSTRAINT "mission_volunteers_volunteer_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_reporter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "report_comments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_completions" ALTER COLUMN "completed_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ALTER COLUMN "volunteer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_completions" ADD CONSTRAINT "mission_completions_completed_by_id_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_messages" ADD CONSTRAINT "mission_messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_volunteers" ADD CONSTRAINT "mission_volunteers_volunteer_id_user_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;