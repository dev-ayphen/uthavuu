// docs/PRODUCT-DECISIONS.md Decision 2: Community Comments (public, any
// authenticated user) vs Mission Chat (private, reporter + active
// volunteers only, see missions-schema.ts). This table is deliberately NOT
// gated by MissionsService.hasActiveAccess() — that gate is Mission Chat's
// security boundary, not this one.
//
// Decision 2's mobile checklist also calls for "flag action per comment,
// reusing the existing reason list" — docs/API-CONTRACT.md's draft models
// flags as a generic {targetType, targetId, reason} table, but no
// request-flagging exists anywhere in this codebase yet (flagging was
// explicitly out of scope for both report-a-request and Accept & Mission
// Chat), so a fully polymorphic flags table would be speculative. Scoped
// here to just what Decision 2 actually requires: flagging a comment.
// There's no moderation UI yet (no admin console exists) — this stores the
// flag for a future admin build, same "capture now, act on later" pattern
// as the FCM device-registration-without-a-send-path module.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const reportComments = pgTable(
  'report_comments',
  {
    id: uuid('id').primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    // Nullable + SET NULL — a comment is preserved for other participants'
    // context even if its author later deletes their account; only the
    // identity is removed, never the body.
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('report_comments_report_id_idx').on(table.reportId)]
);

// Submitted → Under Review → Action Taken → Dismissed. There's no admin
// console yet to actually move a flag through this lifecycle (moderation UI
// is a future admin-console build, same "capture now, act on later" pattern
// this file already documents at the top) — every flag is created and stays
// at 'submitted' today. That's correct, not a gap: the column exists so the
// mobile Flagged Comments screen shows a real, honest status rather than
// nothing, and so a future admin build has somewhere real to write to.
export const flagStatuses = pgTable('flag_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportCommentFlags = pgTable(
  'report_comment_flags',
  {
    id: uuid('id').primaryKey(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => reportComments.id, { onDelete: 'cascade' }),
    flaggedById: text('flagged_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    statusId: uuid('status_id')
      .notNull()
      .references(() => flagStatuses.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('report_comment_flags_comment_id_idx').on(table.commentId),
    // Profile → Flagged Comments needs to list a user's flags idempotently —
    // flagging the same comment twice should be a no-op (ON CONFLICT DO
    // NOTHING), same idempotency shape as report_likes/report_saves,
    // not a growing pile of duplicate rows for one user+comment pair.
    uniqueIndex('report_comment_flags_comment_id_flagged_by_id_key').on(table.commentId, table.flaggedById),
  ]
);

export const flagStatusRelations = relations(flagStatuses, ({ many }) => ({
  flags: many(reportCommentFlags),
}));

export const reportCommentRelations = relations(reportComments, ({ one, many }) => ({
  report: one(reports, { fields: [reportComments.reportId], references: [reports.id] }),
  author: one(user, { fields: [reportComments.authorId], references: [user.id] }),
  flags: many(reportCommentFlags),
}));

export const reportCommentFlagRelations = relations(reportCommentFlags, ({ one }) => ({
  comment: one(reportComments, { fields: [reportCommentFlags.commentId], references: [reportComments.id] }),
  flaggedBy: one(user, { fields: [reportCommentFlags.flaggedById], references: [user.id] }),
  status: one(flagStatuses, { fields: [reportCommentFlags.statusId], references: [flagStatuses.id] }),
}));
