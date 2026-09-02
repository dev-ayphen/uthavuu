// Profile → Help & Support. Support is a two-way CONVERSATION, not a capture
// form: `support_tickets` is the thread header and `support_ticket_messages` is
// the thread. Category, status, priority and sender type are lookup tables, not
// hardcoded enums (CLAUDE.md § Database) — same reasoning as
// report_categories/report_statuses.
//
// NOT MISSION CHAT (ADR 0010). A ticket may *reference* a report via
// `related_report_id`, but nothing in the support module reads
// `mission_messages`, and holding a report id here grants no access to that
// report's chat. Two separate tables, two separate gates, on purpose.
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

/**
 * The counter behind `support_tickets.ticket_number`.
 *
 * A sequence rather than `max(ticket_number) + 1` in the service: two citizens
 * filing at the same moment would otherwise both read the same max and race for
 * the same number, and the unique index would turn that into a 500 for whoever
 * lost. `nextval` is the one allocation that cannot collide, and because it is
 * the column's DEFAULT the application never names a number at all.
 *
 * Starts at 1000 so the first ticket is `UT-1000` — a support reference a
 * citizen reads out over the phone should not be `UT-1`, which looks like a test
 * row and tells the world exactly how many tickets the product has ever had.
 */
export const supportTicketNumberSeq = pgSequence('support_ticket_number_seq', {
  startWith: 1000,
  increment: 1,
  minValue: 1,
  cache: 1,
});

export const ticketCategories = pgTable('ticket_categories', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The five-state lifecycle. Seeded by db/seed.ts; the keys the code branches on
 * are in support/ticket-status.ts.
 *
 * `resolved` and `closed` are deliberately DIFFERENT states rather than one
 * "done": resolved means support believes it is fixed and the citizen may still
 * reply (which reopens the ticket), closed means the conversation is over and
 * new messages are refused. Collapsing them would either trap a citizen whose
 * problem was not actually fixed, or leave every ticket in the queue writable
 * forever.
 *
 * The three original keys — `new`, `in_review`, `resolved` — were MIGRATED, not
 * replaced: migration 0023 renames `new` -> `open` and `in_review` ->
 * `in_progress` in place, so the tickets already pointing at those rows keep a
 * meaningful status. Deleting them was never an option; the FK from
 * support_tickets.status_id would have blocked it, and correctly so.
 */
export const ticketStatuses = pgTable('ticket_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  // The lifecycle has an order and the console renders it in that order;
  // alphabetical would put `closed` first and `waiting_for_user` last.
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Triage order: low / normal / high / urgent.
 *
 * A lookup table rather than an integer column, for the reason ADR 0012 gives
 * for the audit catalogue: the console's filter needs the complete, ordered set
 * on day one, and `select distinct` over the tickets can only ever offer the
 * priorities somebody already used.
 *
 * Set by staff only — a citizen cannot self-declare their ticket urgent, which
 * is the only way a priority field stays meaningful.
 */
export const ticketPriorities = pgTable('ticket_priorities', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Who wrote a message: `user` or `admin`.
 *
 * Kept as its own column rather than derived from "is sender_user_id an admin?"
 * — that derivation is a lie the moment an admin's console access is revoked
 * (admin.revoke deletes the admin_users row, leaving their past replies looking
 * like citizen messages) or the sender's account is deleted (sender_user_id goes
 * null and the derivation has nothing left to read). The side a message was sent
 * from is a fact about the message, recorded at write time.
 */
export const ticketMessageSenderTypes = pgTable('ticket_message_sender_types', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey(),
    /**
     * The reference a citizen quotes and staff search on — `UT-1042`.
     *
     * Its DEFAULT is the sequence above, so it is allocated by the database on
     * insert and no code path can produce a ticket without one. A uuid is
     * unusable for this: nobody reads one aloud, and the mobile app needs
     * something short enough to show on a card.
     */
    ticketNumber: text('ticket_number')
      .notNull()
      .unique()
      .default(sql`'UT-' || nextval('support_ticket_number_seq')`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => ticketCategories.id),
    statusId: uuid('status_id')
      .notNull()
      .references(() => ticketStatuses.id),
    priorityId: uuid('priority_id')
      .notNull()
      .references(() => ticketPriorities.id),
    /**
     * The admin who owns this ticket, or null for unassigned.
     *
     * SET NULL, never CASCADE: an admin leaving must not delete the tickets they
     * were handling. The ticket returns to the unassigned queue, which is
     * exactly what should happen to somebody's workload when they leave.
     *
     * References `user.id` rather than `admin_users.user_id` on purpose —
     * admin_users CASCADEs on user deletion and a revoked admin loses that row
     * entirely, so an FK to it would drop the assignment for someone who is
     * still a real person with a real name to show in the audit trail. The
     * "is this actually an admin?" check happens at assign time in the service.
     */
    assignedAdminId: text('assigned_admin_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    /**
     * The request this ticket is about, if any. Nullable — most tickets are
     * about the app, not about one report.
     *
     * SET NULL so a soft/hard-deleted report does not take the ticket with it,
     * and READ-ONLY as far as access control goes: this column lets staff see
     * which request a complaint refers to. It grants the ticket's author
     * nothing they did not already have, and it never reaches Mission Chat
     * (ADR 0010).
     */
    relatedReportId: uuid('related_report_id').references(() => reports.id, {
      onDelete: 'set null',
    }),
    subject: text('subject').notNull(),
    // The citizen's opening message. Kept as a column rather than migrated into
    // support_ticket_messages as message #1: it is NOT NULL on every existing
    // row, the mobile client already renders it as the ticket body, and moving
    // it would make "the ticket has no description" representable for no gain.
    description: text('description').notNull(),
    /**
     * When support last said "this is fixed", and when the thread was finally
     * shut. Both nullable, and both are timestamps rather than being inferred
     * from status_id — a ticket that is resolved, reopened by the citizen and
     * resolved again passes through `resolved` twice, and the status column can
     * only ever hold the current one.
     */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The citizen's own list — `where user_id = ? order by created_at desc`.
    index('support_tickets_user_id_idx').on(table.userId, table.createdAt),
    // The console's queue filters.
    index('support_tickets_status_id_idx').on(table.statusId),
    index('support_tickets_assigned_admin_id_idx').on(table.assignedAdminId),
  ],
);

/**
 * The conversation. One row per message, in either direction.
 *
 * `is_internal_note` IS A PRIVACY BOUNDARY, NOT A DISPLAY FLAG. A note is staff
 * talking to staff on the citizen's ticket — "this user has filed six of these",
 * "escalated to the police liaison". Every citizen-facing projection filters
 * `is_internal_note = false` in SQL, in one place (SupportService), and a spec
 * serialises the whole citizen payload and asserts the note's text is not in it.
 * The same discipline ADR 0010 applies to Mission Chat, for the same reason:
 * a filter applied by the client is not a filter.
 */
export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: uuid('id').primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    /**
     * NOTE FOR WHOEVER NEXT ALTERS THIS FK. Drizzle derives its constraint name
     * as `support_ticket_messages_sender_type_id_ticket_message_sender_types_id_fk`
     * — 66 characters, which Postgres silently truncates to 63 on creation. The
     * snapshot in `drizzle/meta/` records the full name, so a future migration
     * that DROPs this constraint by that name will not find it. Nothing is
     * broken today (the constraint exists and is enforced); if you do need to
     * change it, give it an explicit short name via `foreignKey({ name: ... })`
     * and drop the truncated one by its real 63-character name.
     */
    senderTypeId: uuid('sender_type_id')
      .notNull()
      .references(() => ticketMessageSenderTypes.id),
    /**
     * Nullable + SET NULL — the message body survives its author's account
     * deletion, the same rule mission_messages uses. A support thread that loses
     * half its content because a citizen deleted their account is a thread
     * nobody can audit afterwards; only the identity goes.
     */
    senderUserId: text('sender_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    isInternalNote: boolean('is_internal_note').default(false).notNull(),
    // No updated_at and no deleted_at, deliberately. A support conversation is a
    // record of what was said; an editable or disappearing message is a record
    // of nothing. Same reasoning as admin_audit_logs (ADR 0012).
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Every read of this table is "one ticket's messages, oldest first".
    index('support_ticket_messages_ticket_id_idx').on(
      table.ticketId,
      table.createdAt,
    ),
  ],
);

export const supportTicketRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(user, { fields: [supportTickets.userId], references: [user.id] }),
  category: one(ticketCategories, { fields: [supportTickets.categoryId], references: [ticketCategories.id] }),
  status: one(ticketStatuses, { fields: [supportTickets.statusId], references: [ticketStatuses.id] }),
  priority: one(ticketPriorities, { fields: [supportTickets.priorityId], references: [ticketPriorities.id] }),
  assignedAdmin: one(user, { fields: [supportTickets.assignedAdminId], references: [user.id] }),
  relatedReport: one(reports, { fields: [supportTickets.relatedReportId], references: [reports.id] }),
  messages: many(supportTicketMessages),
}));

export const supportTicketMessageRelations = relations(supportTicketMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportTicketMessages.ticketId], references: [supportTickets.id] }),
  senderType: one(ticketMessageSenderTypes, {
    fields: [supportTicketMessages.senderTypeId],
    references: [ticketMessageSenderTypes.id],
  }),
  sender: one(user, { fields: [supportTicketMessages.senderUserId], references: [user.id] }),
}));
