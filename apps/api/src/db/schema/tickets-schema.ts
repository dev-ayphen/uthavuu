// Profile → Help & Support / Submit Ticket. Category and status are lookup
// tables, not hardcoded enums (CLAUDE.md § Database) — same reasoning as
// report_categories/report_statuses. No admin-side ticket management exists
// yet (apps/admin work comes after mobile, per this project's standing
// order) — statusId just needs to be real and FK'd so an admin console can
// update it later without a schema change.
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const ticketCategories = pgTable('ticket_categories', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ticketStatuses = pgTable('ticket_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => ticketCategories.id),
  statusId: uuid('status_id')
    .notNull()
    .references(() => ticketStatuses.id),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supportTicketRelations = relations(supportTickets, ({ one }) => ({
  user: one(user, { fields: [supportTickets.userId], references: [user.id] }),
  category: one(ticketCategories, { fields: [supportTickets.categoryId], references: [ticketCategories.id] }),
  status: one(ticketStatuses, { fields: [supportTickets.statusId], references: [ticketStatuses.id] }),
}));
