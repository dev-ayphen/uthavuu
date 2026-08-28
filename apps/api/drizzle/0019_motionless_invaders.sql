CREATE TABLE "user_account_status" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status_id" uuid NOT NULL,
	"reason" text,
	"suspended_at" timestamp with time zone,
	"suspended_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "user_account_status" ADD CONSTRAINT "user_account_status_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_account_status" ADD CONSTRAINT "user_account_status_status_id_user_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."user_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_account_status" ADD CONSTRAINT "user_account_status_suspended_by_user_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_account_status_status_id_idx" ON "user_account_status" USING btree ("status_id");