// Community -> Broadcasts: an admin-authored notice PUSHED to citizens.
//
// ─── WHY THIS IS NOT `community_updates` (ADR 0013) ─────────────────────────
//
// Announcements (`updates-schema.ts`) and Broadcasts look similar on a form —
// both are bilingual staff-authored copy — and they are opposite in the one way
// that decides the schema: direction.
//
//   Announcement -> PULLED. One row, no recipient. The citizen opens the app and
//                   `GET /updates` reads it. Nobody is notified. A row published
//                   at 3am is read at 9am by whoever happens to look.
//   Broadcast    -> PUSHED. One row per RECIPIENT, written into `alerts`, plus an
//                   FCM notification. It arrives whether or not the app is open.
//
// That is why this table has `audience` / `recipient_count` / `sent_at` and
// `community_updates` has `publish_at` / `expires_at`: one addresses people, the
// other publishes a page. ADR 0013 exists because these two were merged once
// already, under a third name, and the correction cost a migration.
//
// ─── WHAT THIS TABLE IS NOT ─────────────────────────────────────────────────
//
// It is NOT the delivery record. A broadcast row is the ORDER — the copy, who it
// was aimed at, who pressed send, and what the fan-out counted. The delivered
// artefacts are `alerts` rows (one per recipient, `type = 'broadcast'`, carrying
// `read_at` and surviving independently) and FCM messages (which persist
// nowhere). Deleting a broadcast draft cannot un-send anything, which is exactly
// why `DELETE` is refused on anything past `draft`.
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * draft | scheduled | sending | sent | cancelled.
 *
 * A lookup table referenced by FK, per CLAUDE.md § Database — the same shape as
 * `community_update_statuses` and `user_statuses`, for the same three reasons:
 * renaming the label an admin sees is a data change, the FK makes an unknown
 * status a write-time failure, and the console's status filter gets a complete
 * catalogue instead of `select distinct` over whatever has happened so far.
 *
 * `sending` is the one that earns its keep. It is not cosmetic: the send path
 * claims a broadcast by moving it draft/scheduled -> `sending` CONDITIONALLY, in
 * its own committed transaction, so two admins pressing Send at the same moment
 * cannot both fan out. It is also the honest state a broadcast is left in if the
 * request dies mid-fan-out — visible in the console as "started, did not finish"
 * rather than silently reverting to `draft` and inviting a second send that
 * would double-notify everyone who already got the first one.
 */
export const broadcastStatuses = pgTable('broadcast_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * all_users | district — who the fan-out selects.
 *
 * A lookup table like every other enum here, but note what it does NOT buy:
 * unlike a status, adding an audience is ALWAYS a code change, because somebody
 * has to write the recipient query that the new key means. Seeding a third row
 * would produce a console option that selects nobody. The table is still the
 * right shape (labels are data, the FK rejects a typo, the filter dropdown is
 * complete) — but `BROADCAST_AUDIENCE_KEYS` below is the real authority on which
 * keys are implemented, and it is a closed union for exactly that reason.
 */
export const broadcastAudiences = pgTable('broadcast_audiences', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const broadcasts = pgTable(
  'broadcasts',
  {
    id: uuid('id').primaryKey(),

    // THE TWO-COLUMN TRANSLATION MODEL, identical to community_updates and for
    // the identical reason: this is free-form editorial copy typed by a human,
    // so there is no template to interpolate and the translation has to be
    // STORED rather than computed. English is NOT NULL because it is what every
    // other locale falls back TO, so it cannot itself be optional. Tamil is
    // nullable because a broadcast must be sendable the moment it is written —
    // this is an emergency product, and blocking a flood warning on a
    // translation would be the wrong failure.
    //
    // The fallback is PER FIELD, not per row: a Tamil headline over an English
    // body is a legitimate half-translated state, not an error. Resolution lives
    // in alerts/alert-templates.ts (`renderBroadcastAlert`), applied once per
    // recipient at fan-out time against that recipient's `user.locale`.
    titleEn: text('title_en').notNull(),
    bodyEn: text('body_en').notNull(),
    // NULL, deliberately never the empty string: '' would render as a blank
    // notification in Tamil, silently, where NULL routes through the English
    // fallback. "Not translated" has exactly one spelling.
    titleTa: text('title_ta'),
    bodyTa: text('body_ta'),

    statusId: uuid('status_id')
      .notNull()
      .references(() => broadcastStatuses.id),

    audienceId: uuid('audience_id')
      .notNull()
      .references(() => broadcastAudiences.id),

    // Required when audience = 'district', null when audience = 'all_users'.
    //
    // Free text matched against `user.district`, which is itself free text
    // written by the mobile client's reverse-geocode (auth-schema.ts:34,
    // users/dto/complete-profile.dto.ts). There is no districts table to key
    // against, so this is a string comparison and a typo selects nobody. That is
    // a real sharp edge and it is why the send path reports `recipientCount`
    // back to the console: an audience of 0 is visible rather than silent.
    //
    // NOT enforced by a DB CHECK. The pairing rule (district set iff audience is
    // 'district') is enforced in the DTO's `.refine()` for a whole payload and
    // re-checked in AdminBroadcastsService.update() against the MERGED row,
    // because a PATCH carrying one half of the pair sails past any DTO. Those
    // two are the only guards — stated here so the next reader does not assume
    // the database is holding it.
    district: text('district'),

    // When an admin asked for this to go out. NOT a status, and not the same
    // thing as `sent_at`.
    //
    // ⚠️ NOTHING SWEEPS THIS YET. A `scheduled` broadcast does not send itself:
    // there is no cron in this API (`@nestjs/schedule` is not a dependency) and
    // no queue (BullMQ is not installed — CLAUDE.md's App Profile has realtime
    // `none` and the only Redis use is sessions/rate-limits). `scheduled` today
    // means "an admin has set a time and the console shows it"; the send is
    // still POST /admin/broadcasts/:id/send. Documented rather than pretended:
    // a scheduling UI that silently never fires would be worse than a visible
    // manual step. Wiring a sweeper later reads this column and calls the same
    // `send()` — no schema change.
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),

    // Stamped by the fan-out when it completes. Null while draft/scheduled/
    // cancelled, and — importantly — still null on a broadcast stuck in
    // `sending`, which is how "started and did not finish" is distinguishable
    // from "finished".
    sentAt: timestamp('sent_at', { withTimezone: true }),

    // ─── TWO COUNTS THAT ARE NOT THE SAME NUMBER ─────────────────────────────
    //
    // Both nullable until the send runs, because "not sent yet" and "sent to
    // nobody" are different facts and 0 must be allowed to mean the second one.
    //
    // recipient_count = how many `alerts` rows were written. This is IN-APP
    //   REACH, counted in PEOPLE, and it is the durable number: those rows are
    //   committed before any push is attempted, so this is what the broadcast
    //   actually achieved.
    //
    // delivered_count = how many FCM sends the provider ACCEPTED. This is PUSH
    //   delivery, counted in DEVICE SENDS, and it is best-effort telemetry. It
    //   is routinely LOWER than recipient_count (most users have no registered
    //   device) and can be HIGHER (one user with a phone and a tablet counts
    //   twice). It can be 0 while recipient_count is 50,000 — that means FCM was
    //   unreachable, NOT that nobody was notified.
    //
    // DO NOT render these as "50,000 sent, 12,000 delivered" as if the second
    // were a subset of the first. They measure different things in different
    // units, and conflating them would report a successful broadcast as a failed
    // one. Nothing downstream may treat delivered_count as a delivery guarantee:
    // FCM accepting a message is not a handset displaying it.
    recipientCount: integer('recipient_count'),
    deliveredCount: integer('delivered_count'),

    // text, not uuid: Better Auth owns `user.id` and it is a text column.
    //
    // ON DELETE SET NULL, never CASCADE — the same reasoning as
    // admin_audit_logs.actor_user_id and community_updates.author_admin_user_id.
    // A sent broadcast is history: it reached tens of thousands of people, and
    // deleting the staff account that sent it must not delete the record of it
    // having happened. CASCADE here would make account deletion a way to erase
    // evidence of what was broadcast to the public.
    //
    // NULL therefore means exactly one thing — the sender's account is gone —
    // which is what the API's `createdByDeleted` flag reports.
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),

    // Soft delete, added deliberately rather than by habit (CLAUDE.md: "add it
    // per-table, deliberately"). This table earns it twice over:
    //
    //  1. DELETE is refused on anything past `draft`, so the only rows this
    //     column ever marks are broadcasts that reached nobody — but the audit
    //     entry still points at the id, and a hard delete would leave it
    //     pointing at nothing (ADR 0012's non-FK `target_id`).
    //  2. "What did the alert we pulled actually say" is a question asked after
    //     the fact about anything sent to the whole user base. Keeping the row
    //     keeps the copy.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // The console's default view: newest first, optionally filtered by status.
    // Leading with status_id because that is the equality predicate.
    index('broadcasts_status_created_at_idx').on(
      table.statusId,
      table.createdAt,
    ),
    index('broadcasts_created_at_idx').on(table.createdAt),
    // For the sweeper that does not exist yet (see `scheduledAt` above). Cheap
    // now, and the alternative is remembering to add it in the migration that
    // finally adds the cron — by which point the table has rows.
    index('broadcasts_scheduled_at_idx').on(table.scheduledAt),
  ],
);

export const broadcastStatusRelations = relations(
  broadcastStatuses,
  ({ many }) => ({ broadcasts: many(broadcasts) }),
);

export const broadcastAudienceRelations = relations(
  broadcastAudiences,
  ({ many }) => ({ broadcasts: many(broadcasts) }),
);

export const broadcastRelations = relations(broadcasts, ({ one }) => ({
  status: one(broadcastStatuses, {
    fields: [broadcasts.statusId],
    references: [broadcastStatuses.id],
  }),
  audience: one(broadcastAudiences, {
    fields: [broadcasts.audienceId],
    references: [broadcastAudiences.id],
  }),
  sender: one(user, {
    fields: [broadcasts.createdBy],
    references: [user.id],
  }),
}));

export type Broadcast = typeof broadcasts.$inferSelect;
export type NewBroadcast = typeof broadcasts.$inferInsert;
export type BroadcastStatus = typeof broadcastStatuses.$inferSelect;
export type BroadcastAudience = typeof broadcastAudiences.$inferSelect;

/**
 * The five seeded status keys, as a closed union.
 *
 * The runtime authority is the database (the rule admin-audit-catalogue.ts
 * states): the service resolves a key to an id by querying `broadcast_statuses`,
 * so a key listed here but never seeded fails loudly on first use. This union
 * exists so a typo at a call site is a compile error rather than a row nobody
 * can find.
 */
export const BROADCAST_STATUS_KEYS = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
] as const;

export type BroadcastStatusKey = (typeof BROADCAST_STATUS_KEYS)[number];

/**
 * The audiences the fan-out actually implements.
 *
 * Unlike the status union above, this one is load-bearing at the API edge: the
 * create/update DTOs validate against it with `z.enum`, because an audience the
 * recipient query does not understand would produce a broadcast that selects
 * nobody and reports success. See `broadcastAudiences` for why the lookup table
 * still exists alongside it.
 */
export const BROADCAST_AUDIENCE_KEYS = ['all_users', 'district'] as const;

export type BroadcastAudienceKey = (typeof BROADCAST_AUDIENCE_KEYS)[number];

/**
 * The statuses a broadcast can still be edited or sent from.
 *
 * Everything else is terminal, and the send path's conditional claim depends on
 * this list being exactly the set that has not yet notified anybody.
 */
export const BROADCAST_MUTABLE_STATUS_KEYS = [
  'draft',
  'scheduled',
] as const satisfies readonly BroadcastStatusKey[];
