// Community -> Updates: admin-authored announcements shown to citizens in the
// mobile app.
//
// One row is a single announcement, written once by a member of staff and read
// by everyone. There is no per-citizen state here — no read receipts, no
// targeting, no dismissal. That is what separates this table from `alerts`
// (alerts-schema.ts), which is one row PER USER per event and carries `read_at`.
// An announcement is broadcast; an alert is addressed. Merging them would mean
// either fanning one announcement out to every user row or bolting a
// "recipient is everyone" special case onto a table whose whole shape assumes a
// recipient.
//
// THE TWO-COLUMN TRANSLATION MODEL. Unlike `alerts`, which stores structured
// `params` and renders prose per-locale at read time (alert-templates.ts), an
// announcement's text is free-form editorial copy typed by a human. There is no
// template to interpolate, so the translation has to be stored, not computed —
// hence title_en/body_en (NOT NULL, the always-present original) alongside
// title_ta/body_ta (NULLABLE, supplied when someone has actually written the
// Tamil). Nullable is the load-bearing half: an announcement must be publishable
// the moment it is written, without blocking on a translation, and a citizen
// reading in Tamil then falls back to the English rather than to a blank card.
// The fallback lives in UpdatesService, and it is per-field — a row may have a
// Tamil title and an English body if that is what was written.
//
// Two columns rather than a `community_update_translations` child table: the
// locale set is closed at two ('en' | 'ta', the locales the mobile catalog
// ships — see auth-schema.ts's note on `user.locale`), and a child table would
// buy generality this product has no use for at the cost of a join and a
// "which row wins" question on every read.
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
 * draft | published | archived.
 *
 * A lookup table referenced by FK, per CLAUDE.md § Database — not a `text`
 * enum and not `pgEnum`. The same shape as `user_statuses` and
 * `ticket_statuses`: renaming the label an admin sees is a data change, the FK
 * makes an unknown status a write-time failure, and the console's status filter
 * gets a complete catalogue instead of `select distinct` over whatever has
 * happened to exist so far.
 */
export const communityUpdateStatuses = pgTable('community_update_statuses', {
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

export const communityUpdates = pgTable(
  'community_updates',
  {
    id: uuid('id').primaryKey(),

    // The original. NOT NULL because something has to be renderable for every
    // reader, in every locale, always — this is the fallback the Tamil columns
    // fall back TO, so it cannot itself be optional.
    titleEn: text('title_en').notNull(),
    bodyEn: text('body_en').notNull(),
    // The translation. NULL means "not translated yet", which is a normal,
    // publishable state — see the header. NULL is deliberately not the empty
    // string: '' would render as a blank card in Tamil, silently, whereas NULL
    // routes through the fallback.
    titleTa: text('title_ta'),
    bodyTa: text('body_ta'),

    statusId: uuid('status_id')
      .notNull()
      .references(() => communityUpdateStatuses.id),

    // Scheduling. Both nullable, and the two nulls mean different things:
    //
    //   publish_at NULL  -> visible as soon as the status is `published`.
    //   expires_at NULL  -> never stops being visible.
    //
    // Neither is a status. An update scheduled for tomorrow is `published` with
    // a future `publish_at`, and it is the citizen query — not a cron job —
    // that decides it is not visible yet. Nothing has to run on time for the
    // schedule to be correct, which is the whole reason these are timestamps
    // rather than a `scheduled` status somebody has to sweep.
    publishAt: timestamp('publish_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // text, not uuid: Better Auth owns `user.id` and it is a text column.
    //
    // ON DELETE SET NULL, never CASCADE — the same reasoning as
    // admin_audit_logs.actor_user_id (audit-schema.ts). An announcement outlives
    // the admin who wrote it: a public notice about a flood does not stop being
    // true, or stop needing to be visible, because the person who typed it left
    // the organisation. CASCADE would make deleting a staff account silently
    // retract every announcement they ever posted.
    //
    // NULL here therefore means exactly one thing — the author's account is
    // gone — which is what the API's `authorDeleted` flag reports.
    authorAdminUserId: text('author_admin_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),

    // Soft delete, added deliberately rather than by habit (CLAUDE.md: "add it
    // per-table, deliberately"). This table earns it: an announcement is
    // published to the whole user base, so "who deleted the flood notice, and
    // what did it say" is a question that gets asked after the fact. The
    // admin_audit_logs row records who and when; keeping the row keeps the
    // text. A hard delete would leave the audit entry pointing at nothing.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // The citizen feed's query: status = published AND publish_at <= now().
    // Leading with status_id because it is the equality predicate.
    index('community_updates_status_publish_at_idx').on(
      table.statusId,
      table.publishAt,
    ),
    // The console's default view, newest first, unfiltered.
    index('community_updates_created_at_idx').on(table.createdAt),
  ],
);

export const communityUpdateStatusRelations = relations(
  communityUpdateStatuses,
  ({ many }) => ({ updates: many(communityUpdates) }),
);

export const communityUpdateRelations = relations(
  communityUpdates,
  ({ one }) => ({
    status: one(communityUpdateStatuses, {
      fields: [communityUpdates.statusId],
      references: [communityUpdateStatuses.id],
    }),
    author: one(user, {
      fields: [communityUpdates.authorAdminUserId],
      references: [user.id],
    }),
  }),
);

export type CommunityUpdate = typeof communityUpdates.$inferSelect;
export type NewCommunityUpdate = typeof communityUpdates.$inferInsert;
export type CommunityUpdateStatus = typeof communityUpdateStatuses.$inferSelect;

/**
 * The three seeded status keys, as a closed union.
 *
 * The runtime authority is the database (the same rule admin-audit-catalogue.ts
 * states): the service resolves a key to an id by querying
 * `community_update_statuses`, so a key listed here but never seeded fails
 * loudly on first use. This union exists so a typo at a call site is a compile
 * error rather than a row nobody can find.
 */
export const COMMUNITY_UPDATE_STATUS_KEYS = [
  'draft',
  'published',
  'archived',
] as const;

export type CommunityUpdateStatusKey =
  (typeof COMMUNITY_UPDATE_STATUS_KEYS)[number];
