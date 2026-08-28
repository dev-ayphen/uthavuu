CREATE TABLE "admin_audit_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"target_type_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_actions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_email" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role_key" text NOT NULL,
	"action_id" uuid NOT NULL,
	"target_type_id" uuid NOT NULL,
	"target_id" text,
	"target_label" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_target_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_target_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "report_comments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_comments" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_action_id_admin_audit_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."admin_audit_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_type_id_admin_audit_target_types_id_fk" FOREIGN KEY ("target_type_id") REFERENCES "public"."admin_audit_target_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_user_id_idx" ON "admin_audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_id_idx" ON "admin_audit_logs" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" USING btree ("target_type_id","target_id");--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;