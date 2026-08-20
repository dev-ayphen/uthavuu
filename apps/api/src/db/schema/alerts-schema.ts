// A simple append-only notification log — polled via GET /users/me/alerts
// per the App Profile (realtime: none). `type` is a plain text tag, not a
// lookup-table FK: it's an event-log discriminator with no valid-transition
// rules to enforce (unlike report/mission-volunteer status), so a lookup
// table would add ceremony without benefit. Known values live in
// alerts.service.ts, not enforced at the DB layer.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Deep-links the alert back to a request; null for alerts with no
    // single report to open (none exist yet, but the shape allows it).
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('alerts_user_id_idx').on(table.userId)]
);

export const alertRelations = relations(alerts, ({ one }) => ({
  user: one(user, { fields: [alerts.userId], references: [user.id] }),
  report: one(reports, { fields: [alerts.reportId], references: [reports.id] }),
}));
