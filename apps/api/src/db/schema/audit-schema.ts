// The admin audit trail.
//
// docs/webadmin/09-admins-and-audit.md names "audit logs are never written" as a
// headline failure of the prototype, and
// docs/architecture/admin-console-integration.md ranks it #3 of the five gaps
// that block the console — specifically with the instruction to build it
// *before* the first mutating admin endpoint, not after. This file is that
// table, and every mutating route on the /admin surface writes to it.
//
// Three tables, and the split is deliberate:
//
//   admin_audit_actions       lookup — 'report.hide', 'comment.remove', ...
//   admin_audit_target_types  lookup — 'report', 'comment', ...
//   admin_audit_logs          the append-only trail itself
//
// Why lookup tables rather than plain text columns, when alerts-schema.ts
// deliberately went the other way for its own `type` discriminator: an audit
// action key is *filtered on* by a UI dropdown. A `select distinct action from
// admin_audit_logs` can only ever show actions that have already happened, so
// the Platform -> Audit Logs filter would silently lack an option until someone
// used it. A lookup table gives that dropdown a complete, ordered catalogue on
// day one, and the FK turns a typo'd action key into a write-time failure
// instead of an unfilterable orphan row. That is a real benefit, which is the
// bar CLAUDE.md's lookup-table rule is actually asking for.
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const adminAuditActions = pgTable('admin_audit_actions', {
  id: uuid('id').primaryKey(),
  // `target.verb` — 'report.hide', 'comment_flag.resolve'. Deliberately not the
  // `module:action` RBAC form: a permission answers "may you", an audit action
  // records "what happened to which thing", and using one shape for both would
  // suggest a 1:1 mapping that does not exist (reports:manage covers four
  // distinct report actions).
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  // What the console groups the filter dropdown by, and the same word the
  // target_type lookup uses. Kept here as plain text rather than an FK to
  // admin_audit_target_types: an action's group is a property of the action's
  // own name, and a second FK would let the two disagree.
  targetTypeKey: text('target_type_key').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const adminAuditTargetTypes = pgTable('admin_audit_target_types', {
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
 * One row per completed admin mutation. Append-only by contract: there is no
 * `updated_at` and no `deleted_at` on this table, deliberately — a record that
 * can be edited or hidden is not an audit trail, and the absence of the columns
 * is what says so to the next person reading the schema.
 */
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey(),

    // SET NULL, never CASCADE. Deleting an admin's account must not delete the
    // evidence of what that admin did — that would make account deletion a
    // trail-erasing tool, which is precisely backwards. The three actor_*
    // snapshot columns below are what keep the row readable once this goes null.
    actorUserId: text('actor_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // Denormalised snapshots taken at write time. `admin_users` CASCADEs on
    // user deletion (admin-schema.ts explains why), so joining back for the
    // actor's role would return nothing for a departed admin. And an admin who
    // later changes role must not have their past actions relabelled with the
    // new one — the role recorded here is the role they held when they acted.
    actorEmail: text('actor_email').notNull(),
    actorName: text('actor_name').notNull(),
    actorRoleKey: text('actor_role_key').notNull(),

    actionId: uuid('action_id')
      .notNull()
      .references(() => adminAuditActions.id),
    targetTypeId: uuid('target_type_id')
      .notNull()
      .references(() => adminAuditTargetTypes.id),

    // text, not uuid: most targets are uuid-keyed but `user.id` is text (Better
    // Auth owns that column's type). One column that holds either beats two
    // nullable ones that must be kept mutually exclusive.
    //
    // Deliberately NOT a foreign key. The target may be hard-deleted later
    // (a report category with no reports, say), and an FK would then either
    // block the delete or null the reference — both of which destroy the record
    // of what was acted on. `targetLabel` is the human-readable snapshot that
    // keeps the row meaningful when the target is gone.
    targetId: text('target_id'),
    targetLabel: text('target_label'),

    // The change itself. Null on actions that have no shape to diff (a pure
    // read-through action would have neither); `before` alone on a removal.
    // For comment.remove this is where the removed comment's body lives, which
    // is what makes a moderation decision reviewable after the fact.
    before: jsonb('before'),
    after: jsonb('after'),

    // Free text from the acting admin. Required by the DTO on destructive
    // actions, optional elsewhere — the column stays nullable so the
    // requirement lives in one place (the DTO) rather than two that can drift.
    reason: text('reason'),

    // Cheap request provenance, both nullable: behind a proxy the address may
    // be absent or untrustworthy, and recording a wrong one confidently is
    // worse than recording none.
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // The Audit Logs page's default view is "most recent first", unfiltered.
    index('admin_audit_logs_created_at_idx').on(table.createdAt),
    index('admin_audit_logs_actor_user_id_idx').on(table.actorUserId),
    index('admin_audit_logs_action_id_idx').on(table.actionId),
    // "everything that ever happened to this report" — the lookup a moderator
    // does when reviewing one item's history.
    index('admin_audit_logs_target_idx').on(table.targetTypeId, table.targetId),
  ],
);

export const adminAuditActionRelations = relations(
  adminAuditActions,
  ({ many }) => ({ logs: many(adminAuditLogs) }),
);

export const adminAuditTargetTypeRelations = relations(
  adminAuditTargetTypes,
  ({ many }) => ({ logs: many(adminAuditLogs) }),
);

export const adminAuditLogRelations = relations(adminAuditLogs, ({ one }) => ({
  actor: one(user, {
    fields: [adminAuditLogs.actorUserId],
    references: [user.id],
  }),
  action: one(adminAuditActions, {
    fields: [adminAuditLogs.actionId],
    references: [adminAuditActions.id],
  }),
  targetType: one(adminAuditTargetTypes, {
    fields: [adminAuditLogs.targetTypeId],
    references: [adminAuditTargetTypes.id],
  }),
}));
