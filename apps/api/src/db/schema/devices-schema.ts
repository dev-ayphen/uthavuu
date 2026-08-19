// Push device registration only (CLAUDE.md's FCM integration) — no send
// path exists yet, no FCM_SERVICE_ACCOUNT_JSON credential configured (same
// situation as msg91 before ADR 0006/0007: build the real scaffolding,
// don't fake the send).
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth-schema';

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Unique — re-registering the same physical device (even under a
  // different account after logout/login) upserts this row rather than
  // creating a duplicate.
  pushToken: text('push_token').notNull().unique(),
  platform: text('platform').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const deviceRelations = relations(devices, ({ one }) => ({
  user: one(user, { fields: [devices.userId], references: [user.id] }),
}));
