CREATE SEQUENCE "public"."support_ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_type_id" uuid NOT NULL,
	"sender_user_id" text,
	"body" text NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_message_sender_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_message_sender_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ticket_priorities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_priorities_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
/*
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA MIGRATION — hand-written, everything below is not drizzle-kit output.
 *
 * `ticket_statuses` had three seeded keys (`new`, `in_review`, `resolved`) and
 * live `support_tickets` rows pointing at them. The lifecycle is now five states
 * (`open`, `in_progress`, `waiting_for_user`, `resolved`, `closed`), so the old
 * rows are RENAMED IN PLACE rather than deleted and re-inserted:
 *
 *     new       -> open
 *     in_review -> in_progress
 *     resolved  -> resolved (label/sort only)
 *
 * Renaming keeps every existing ticket's `status_id` valid and gives it the
 * status it actually meant. Deleting the rows was never available anyway — the
 * FK from support_tickets.status_id would have refused, which is the FK doing
 * its job.
 *
 * WHY THE `WHERE EXISTS (SELECT 1 FROM ticket_statuses)` GUARD ON EVERY INSERT.
 * Master data belongs to `db/seed.ts`, not to migrations. These inserts exist
 * only to keep an ALREADY-SEEDED database (dev, and any deployed one) coherent
 * between `db:migrate` and the next `db:seed` — in particular so the
 * `priority_id` backfill below has a `normal` row to point at. On a fresh
 * database — every admin spec builds one from 0000 — `ticket_statuses` is empty,
 * the guard is false, nothing is inserted, and the specs seed their own lookups
 * without hitting a unique-key conflict. `db:seed` upserts all of these by
 * `key`, so it is a no-op on whatever this wrote.
 * ─────────────────────────────────────────────────────────────────────────────
 */
UPDATE "ticket_statuses" SET "key" = 'open', "label" = 'Open', "sort_order" = 10, "updated_at" = now() WHERE "key" = 'new';--> statement-breakpoint
UPDATE "ticket_statuses" SET "key" = 'in_progress', "label" = 'In Progress', "sort_order" = 20, "updated_at" = now() WHERE "key" = 'in_review';--> statement-breakpoint
UPDATE "ticket_statuses" SET "label" = 'Resolved', "sort_order" = 40, "updated_at" = now() WHERE "key" = 'resolved';--> statement-breakpoint
INSERT INTO "ticket_statuses" ("id", "key", "label", "sort_order")
SELECT * FROM (VALUES
	(gen_random_uuid(), 'waiting_for_user', 'Waiting for User', 30),
	(gen_random_uuid(), 'closed', 'Closed', 50)
) AS v("id", "key", "label", "sort_order")
WHERE EXISTS (SELECT 1 FROM "ticket_statuses")
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_priorities" ("id", "key", "label", "sort_order")
SELECT * FROM (VALUES
	(gen_random_uuid(), 'low', 'Low', 10),
	(gen_random_uuid(), 'normal', 'Normal', 20),
	(gen_random_uuid(), 'high', 'High', 30),
	(gen_random_uuid(), 'urgent', 'Urgent', 40)
) AS v("id", "key", "label", "sort_order")
WHERE EXISTS (SELECT 1 FROM "ticket_statuses")
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "ticket_message_sender_types" ("id", "key", "label", "sort_order")
SELECT * FROM (VALUES
	(gen_random_uuid(), 'user', 'Citizen', 10),
	(gen_random_uuid(), 'admin', 'Support', 20)
) AS v("id", "key", "label", "sort_order")
WHERE EXISTS (SELECT 1 FROM "ticket_statuses")
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
/*
 * `ticket_number` is added nullable, backfilled in creation order, and only then
 * made NOT NULL with its sequence default. drizzle-kit's one-liner
 * (`ADD COLUMN ... DEFAULT 'UT-' || nextval(...) NOT NULL`) would also backfill
 * — a volatile default is evaluated per row — but in whatever order the rewrite
 * happens to visit them, which would hand the oldest ticket an arbitrary number.
 * The window function makes the oldest ticket UT-1000, and `setval` then leaves
 * the sequence pointing exactly past the highest number handed out.
 */
ALTER TABLE "support_tickets" ADD COLUMN "ticket_number" text;--> statement-breakpoint
WITH ordered AS (
	SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn FROM "support_tickets"
)
UPDATE "support_tickets" t SET "ticket_number" = 'UT-' || (999 + o.rn) FROM ordered o WHERE t."id" = o."id";--> statement-breakpoint
SELECT setval('support_ticket_number_seq', 999 + (SELECT count(*) FROM "support_tickets"));--> statement-breakpoint
ALTER TABLE "support_tickets" ALTER COLUMN "ticket_number" SET DEFAULT 'UT-' || nextval('support_ticket_number_seq');--> statement-breakpoint
ALTER TABLE "support_tickets" ALTER COLUMN "ticket_number" SET NOT NULL;--> statement-breakpoint
/* Same shape for priority_id: nullable -> backfill every existing ticket to
 * `normal` -> NOT NULL. Adding it NOT NULL in one statement fails outright on a
 * table that already has rows. */
ALTER TABLE "support_tickets" ADD COLUMN "priority_id" uuid;--> statement-breakpoint
UPDATE "support_tickets" SET "priority_id" = (SELECT "id" FROM "ticket_priorities" WHERE "key" = 'normal') WHERE "priority_id" IS NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ALTER COLUMN "priority_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "assigned_admin_id" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "related_report_id" uuid;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_sender_type_id_ticket_message_sender_types_id_fk" FOREIGN KEY ("sender_type_id") REFERENCES "public"."ticket_message_sender_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_id_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_priority_id_ticket_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."ticket_priorities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_id_user_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_related_report_id_reports_id_fk" FOREIGN KEY ("related_report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_id_idx" ON "support_tickets" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_admin_id_idx" ON "support_tickets" USING btree ("assigned_admin_id");--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number");
