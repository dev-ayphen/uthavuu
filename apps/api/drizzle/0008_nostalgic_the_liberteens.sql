CREATE TABLE "report_likes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_likes" ADD CONSTRAINT "report_likes_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_likes" ADD CONSTRAINT "report_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_likes_report_id_idx" ON "report_likes" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_likes_report_id_user_id_key" ON "report_likes" USING btree ("report_id","user_id");