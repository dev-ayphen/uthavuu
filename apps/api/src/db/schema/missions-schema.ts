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
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const missionVolunteerStatuses = pgTable('mission_volunteer_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Deliberately separate from missionVolunteerStatuses: that table answers
// "is this volunteer part of the mission" (joined/active/released) — this
// one answers "what is an active volunteer currently doing" (on_the_way /
// reached_location / helping_now). Conflating the two would mean a
// volunteer's progress and their participation share one FK, which breaks
// the moment a released volunteer needs to keep their last-known progress
// for history, or a progress value needs to exist independent of whether
// the mission has ended.
export const progressStatuses = pgTable('progress_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const missionVolunteers = pgTable(
  'mission_volunteers',
  {
    id: uuid('id').primaryKey(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    // Nullable + SET NULL, not CASCADE — a deleted volunteer's participation
    // is community mission history (the report/mission survive), only their
    // identity is removed. See UsersService.deleteAccount(): it also
    // explicitly releases this row (status -> 'released') so the slot
    // reopens, not just relying on the FK to null the column.
    volunteerId: text('volunteer_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => missionVolunteerStatuses.id),
    // BR-3: joinedAt + 15 minutes, checked lazily — never a scheduled job.
    confirmDeadline: timestamp('confirm_deadline', {
      withTimezone: true,
    }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    // 'timeout' | 'voluntary' | 'account_deleted' — not a lookup table, just
    // three known literals used internally; never rendered to a user as raw
    // text. 'account_deleted': UsersService.deleteAccount() releases this
    // volunteer's own row so their slot genuinely reopens, rather than
    // leaving it to the FK's SET NULL alone (which anonymizes but doesn't
    // change status).
    releaseReason: text('release_reason'),
    // Null until this volunteer's first progress update (only meaningful
    // once status = 'active'). The three timestamps below are each set once,
    // the first time that specific milestone is reached — re-selecting an
    // earlier progress value moves progressStatusId but never overwrites an
    // already-set timestamp, so the real history of when each milestone was
    // first reached survives even if the volunteer later corrects course.
    progressStatusId: uuid('progress_status_id').references(
      () => progressStatuses.id,
    ),
    onWayAt: timestamp('on_way_at', { withTimezone: true }),
    reachedAt: timestamp('reached_at', { withTimezone: true }),
    helpingAt: timestamp('helping_at', { withTimezone: true }),
  },
  (table) => [
    index('mission_volunteers_mission_id_idx').on(table.missionId),
    index('mission_volunteers_volunteer_id_idx').on(table.volunteerId),
  ],
);

export const missionMessages = pgTable(
  'mission_messages',
  {
    id: uuid('id').primaryKey(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    // Nullable + SET NULL — a chat message is preserved for the other
    // participant's context even if its sender later deletes their account;
    // only the identity is removed, never the body.
    senderId: text('sender_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('mission_messages_mission_id_idx').on(table.missionId)],
);

export const missionCompletionStatuses = pgTable(
  'mission_completion_statuses',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

// docs/features/mission-completion.md BR-4: modeled as a real, distinct,
// timestamped state even though today's verification is synchronous and
// always resolves to 'verified' within the same request — so a future
// pass can make verification genuinely asynchronous without a redesign.
export const missionCompletions = pgTable('mission_completions', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id')
    .notNull()
    .unique()
    .references(() => missions.id, { onDelete: 'cascade' }),
  // Nullable + SET NULL — a completed mission's record (photo/note/who
  // helped) is preserved community history even if the volunteer who
  // completed it later deletes their account.
  completedById: text('completed_by_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  photoUrl: text('photo_url').notNull(),
  note: text('note').notNull(),
  statusId: uuid('status_id')
    .notNull()
    .references(() => missionCompletionStatuses.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

export const missionRelations = relations(missions, ({ one, many }) => ({
  report: one(reports, {
    fields: [missions.reportId],
    references: [reports.id],
  }),
  volunteers: many(missionVolunteers),
  messages: many(missionMessages),
  completion: one(missionCompletions, {
    fields: [missions.id],
    references: [missionCompletions.missionId],
  }),
}));

export const missionVolunteerRelations = relations(
  missionVolunteers,
  ({ one }) => ({
    mission: one(missions, {
      fields: [missionVolunteers.missionId],
      references: [missions.id],
    }),
    volunteer: one(user, {
      fields: [missionVolunteers.volunteerId],
      references: [user.id],
    }),
    status: one(missionVolunteerStatuses, {
      fields: [missionVolunteers.statusId],
      references: [missionVolunteerStatuses.id],
    }),
    progressStatus: one(progressStatuses, {
      fields: [missionVolunteers.progressStatusId],
      references: [progressStatuses.id],
    }),
  }),
);

export const missionMessageRelations = relations(
  missionMessages,
  ({ one }) => ({
    mission: one(missions, {
      fields: [missionMessages.missionId],
      references: [missions.id],
    }),
    sender: one(user, {
      fields: [missionMessages.senderId],
      references: [user.id],
    }),
  }),
);

export const missionCompletionRelations = relations(
  missionCompletions,
  ({ one }) => ({
    mission: one(missions, {
      fields: [missionCompletions.missionId],
      references: [missions.id],
    }),
    completedBy: one(user, {
      fields: [missionCompletions.completedById],
      references: [user.id],
    }),
    status: one(missionCompletionStatuses, {
      fields: [missionCompletions.statusId],
      references: [missionCompletionStatuses.id],
    }),
  }),
);
