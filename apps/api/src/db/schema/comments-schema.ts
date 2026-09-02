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
// It was built before any moderation UI existed, but no longer stops there:
// the admin console reads these flags and resolves them
// (AdminCommentsService.resolveFlag, PATCH /admin/flagged-comments/:id,
// audited as comment_flag.resolve).
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
    // Moderation removal, added deliberately for the admin console's comment
    // moderation — CLAUDE.md's rule is soft-delete only where a feature needs
    // it, and this one does, for two specific reasons a hard DELETE would break:
    //
    //   1. report_comment_flags CASCADEs on comment_id. Hard-deleting a comment
    //      to resolve a flag would destroy the flag row along with it — and the
    //      flagger's Profile -> Flagged Comments screen reads through that row
    //      (CommentsService.listMyFlags()). Their flag would vanish rather than
    //      show "Action Taken", which is the one moderation outcome a citizen
    //      can see today.
    //   2. A moderation decision has to stay reviewable. The audit log stores
    //      the body in its `before` snapshot, but the row itself staying put is
    //      what lets a flag, its comment and the action taken be read together.
    //
    // Every citizen-facing read filters this out, so a removed comment is gone
    // from the public thread exactly as a hard delete would have made it.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // The admin who removed it. SET NULL for the same reason reports.deletedBy
    // is: this is an audit breadcrumb, not a dependency, and it must never block
    // deletion of the account it points at. The durable record of who did it
    // lives in admin_audit_logs, which snapshots the actor's identity.
    deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('report_comments_report_id_idx').on(table.reportId)]
);

// Submitted → Under Review → Action Taken → Dismissed. A flag is created at
// 'submitted' by the mobile client and moved through the rest of the
// lifecycle by the admin console (AdminCommentsService.resolveFlag, PATCH
// /admin/flagged-comments/:id, audited as comment_flag.resolve). The mobile
// Flagged Comments screen reads the status back, so the citizen who raised a
// flag sees the real outcome rather than a placeholder.
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
    // NOTHING), same idempotency shape as report_saves, not a growing pile
    // of duplicate rows for one user+comment pair.
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
