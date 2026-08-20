// docs/features/impact-story.md BR-6/BR-7/BR-8: a like is a plain
// existence/toggle fact with no valid-transition rules to enforce, same
// reasoning alerts.type already uses for staying plain text — no lookup
// table. Idempotency (BR-7) and one-like-per-user (BR-8) are both enforced
// by the unique index below, not just application-level checks.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const reportLikes = pgTable(
  'report_likes',
  {
    id: uuid('id').primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('report_likes_report_id_idx').on(table.reportId),
    uniqueIndex('report_likes_report_id_user_id_key').on(table.reportId, table.userId),
  ]
);

export const reportLikeRelations = relations(reportLikes, ({ one }) => ({
  report: one(reports, { fields: [reportLikes.reportId], references: [reports.id] }),
  user: one(user, { fields: [reportLikes.userId], references: [user.id] }),
}));
