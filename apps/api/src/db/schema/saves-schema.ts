// Mirrors likes-schema.ts exactly: a save is the same kind of plain
// existence/toggle fact a like is (impact-story.md BR-6/BR-7/BR-8's
// reasoning applies identically here) — no lookup table, idempotency and
// one-save-per-user both enforced by the unique index below.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const reportSaves = pgTable(
  'report_saves',
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
    index('report_saves_report_id_idx').on(table.reportId),
    index('report_saves_user_id_idx').on(table.userId),
    uniqueIndex('report_saves_report_id_user_id_key').on(table.reportId, table.userId),
  ]
);

export const reportSaveRelations = relations(reportSaves, ({ one }) => ({
  report: one(reports, { fields: [reportSaves.reportId], references: [reports.id] }),
  user: one(user, { fields: [reportSaves.userId], references: [user.id] }),
}));
