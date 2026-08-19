// docs/features/accept-and-mission-chat.md. `missions` is intentionally
// thin — no status column here, mission-level lifecycle status is deferred
// to the mission-completion feature (see the spec's Data touched section).
// `mission_volunteers.status` tracks only each volunteer's own
// participation (joined -> active -> released), not the mission's.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const missions = pgTable('missions', {
  id: uuid('id').primaryKey(),
  reportId: uuid('report_id')
    .notNull()
    .unique()
    .references(() => reports.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const missionVolunteerStatuses = pgTable('mission_volunteer_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const missionVolunteers = pgTable(
  'mission_volunteers',
  {
    id: uuid('id').primaryKey(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    volunteerId: text('volunteer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => missionVolunteerStatuses.id),
    // BR-3: joinedAt + 15 minutes, checked lazily — never a scheduled job.
    confirmDeadline: timestamp('confirm_deadline', { withTimezone: true }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    // 'timeout' | 'voluntary' — not a lookup table, just two known literals
    // used internally; never rendered to a user as raw text.
    releaseReason: text('release_reason'),
  },
  (table) => [
    index('mission_volunteers_mission_id_idx').on(table.missionId),
    index('mission_volunteers_volunteer_id_idx').on(table.volunteerId),
  ]
);

export const missionMessages = pgTable(
  'mission_messages',
  {
    id: uuid('id').primaryKey(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('mission_messages_mission_id_idx').on(table.missionId)]
);

export const missionRelations = relations(missions, ({ one, many }) => ({
  report: one(reports, { fields: [missions.reportId], references: [reports.id] }),
  volunteers: many(missionVolunteers),
  messages: many(missionMessages),
}));

export const missionVolunteerRelations = relations(missionVolunteers, ({ one }) => ({
  mission: one(missions, { fields: [missionVolunteers.missionId], references: [missions.id] }),
  volunteer: one(user, { fields: [missionVolunteers.volunteerId], references: [user.id] }),
  status: one(missionVolunteerStatuses, {
    fields: [missionVolunteers.statusId],
    references: [missionVolunteerStatuses.id],
  }),
}));

export const missionMessageRelations = relations(missionMessages, ({ one }) => ({
  mission: one(missions, { fields: [missionMessages.missionId], references: [missions.id] }),
  sender: one(user, { fields: [missionMessages.senderId], references: [user.id] }),
}));
