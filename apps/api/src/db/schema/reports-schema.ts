// docs/features/report-a-request.md. Category and status are lookup tables,
// not hardcoded enums (CLAUDE.md § Database) — renaming/adding one is a data
// change via db:seed, not a migration. Urgency is deliberately NOT a column
// here: it's computed client-side from `expiryAt` using the TONES bands
// (docs/design/design-system.md §5) rather than stored — see report-a-request.md BR-2.
import { relations } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const reportCategories = pgTable('report_categories', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  emoji: text('emoji').notNull(),
  // BR-2's per-category default, in minutes — the single server-side source
  // API-CONTRACT.md flagged as missing ("move expiry rules server-side").
  defaultExpiryMinutes: integer('default_expiry_minutes').notNull(),
  // BR-3: Disaster Relief exists as a category but isn't citizen-selectable —
  // the create-report DTO filters on this rather than hardcoding an exclusion.
  citizenSelectable: boolean('citizen_selectable').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportStatuses = pgTable('report_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => reportCategories.id),
    statusId: uuid('status_id')
      .notNull()
      .references(() => reportStatuses.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    // BR-4: authoritative location. `landmark` is a human-readable helper only.
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    landmark: text('landmark'),
    // US-4: privacy. anonymous hides name/photo/profession on the public card;
    // phoneVisible defaults off — a volunteer only sees the number if the
    // reporter explicitly opted in.
    anonymous: boolean('anonymous').default(false).notNull(),
    phoneVisible: boolean('phone_visible').default(false).notNull(),
    // accept-and-mission-chat.md BR-1/BR-2: 1–20, default 1 (solo mission),
    // fixed after publish in v0.1.
    neededVolunteers: integer('needed_volunteers').default(1).notNull(),
    expiryAt: timestamp('expiry_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('reports_reporter_id_idx').on(table.reporterId),
    index('reports_category_id_idx').on(table.categoryId),
    index('reports_status_id_idx').on(table.statusId),
  ]
);

export const reportPhotos = pgTable(
  'report_photos',
  {
    id: uuid('id').primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    // BR-1: only in-app camera capture is accepted client-side today. This
    // stays true unconditionally for v0.1 — see report-a-request.md's "Known
    // enforcement gap": nothing server-side verifies it yet (no EXIF check).
    capturedLive: boolean('captured_live').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('report_photos_report_id_idx').on(table.reportId)]
);

export const reportRelations = relations(reports, ({ one, many }) => ({
  reporter: one(user, { fields: [reports.reporterId], references: [user.id] }),
  category: one(reportCategories, { fields: [reports.categoryId], references: [reportCategories.id] }),
  status: one(reportStatuses, { fields: [reports.statusId], references: [reportStatuses.id] }),
  photos: many(reportPhotos),
}));

export const reportPhotoRelations = relations(reportPhotos, ({ one }) => ({
  report: one(reports, { fields: [reportPhotos.reportId], references: [reports.id] }),
}));
