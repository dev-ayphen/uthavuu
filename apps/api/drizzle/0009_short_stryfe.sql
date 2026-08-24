CREATE TABLE "report_saves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "report_saves" ADD CONSTRAINT "report_saves_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_saves" ADD CONSTRAINT "report_saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_saves_report_id_idx" ON "report_saves" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_saves_user_id_idx" ON "report_saves" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_saves_report_id_user_id_key" ON "report_saves" USING btree ("report_id","user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_invite_code_unique" UNIQUE("invite_code");