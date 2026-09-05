// docs/features/report-a-request.md. Category and status are lookup tables,
// not hardcoded enums (CLAUDE.md § Database) — renaming/adding one is a data
// change via db:seed, not a migration. Urgency is deliberately NOT a column
// here: it's computed client-side from `expiryAt` using the TONES bands
// (docs/design/design-system.md §5) rather than stored — see report-a-request.md BR-2.
import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
  /**
   * Scene labels a photo in this category is expected to contain, used for the
   * category-relevance check during photo verification.
   *
   * NULL means "do not check", and that is a real answer rather than a missing
   * one: Community Help has no characteristic imagery, so enforcing a match
   * would hold legitimate reports for no reason. Lives on the category rather
   * than in code because categories are operator-editable data — a code map
   * would drift the moment someone adds a category through the console.
   *
   * Values are provider label names (Rekognition's `Labels[].Name` and its
   * `Parents`/`Categories`), matched case-insensitively.
   */
  expectedLabels: jsonb('expected_labels').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reportStatuses = pgTable('report_statuses', {
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

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    // Nullable + SET NULL, not CASCADE: a report a volunteer has already
    // responded to (or completed) is community activity other people
    // depend on, not the reporter's personal data — deleting the reporter's
    // account must anonymize the report, never destroy it. See
    // UsersService.deleteAccount() for the full policy (only a genuinely
    // unclaimed report — one no volunteer ever joined — gets soft-deleted
    // alongside the account).
    reporterId: text('reporter_id').references(() => user.id, {
      onDelete: 'set null',
    }),
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
    // edit-cancel-report.md "Delete Report": soft delete only, deliberately —
    // never a hard DELETE FROM reports. A deleted report may already have
    // real related data (photos, comments, likes, audit trail) that stays
    // useful history; hard-deleting the row would destroy it for no benefit
    // over just excluding it from listings. Same reasoning this repo already
    // applies elsewhere for not throwing away data it doesn't have to (see
    // docs/decisions/ for the local-disk-photo-storage precedent of picking
    // the simplest choice that doesn't foreclose a real one later).
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // SET NULL, not the previous no-onDelete-clause (Postgres default NO
    // ACTION): deletedBy is only ever the reporter themselves (see
    // ReportsService.delete()) — with NO ACTION, UsersService.deleteAccount()
    // deleting the user row would be blocked by this FK for any report that
    // user (or their own account-deletion's Rule 1) ever soft-deleted. This
    // is just an audit trail of who triggered the soft-delete; it should go
    // null along with reporterId when that account is gone, not block deletion.
    deletedBy: text('deleted_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('reports_reporter_id_idx').on(table.reporterId),
    index('reports_category_id_idx').on(table.categoryId),
    index('reports_status_id_idx').on(table.statusId),
  ],
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
    //
    // NOTE this is still NOT a provenance signal even now that photo
    // verification exists. Verification answers "is this image safe and roughly
    // relevant"; it says nothing about whether the camera or the gallery
    // produced it. `upload_id` below is the column that carries real,
    // server-established facts about a photo.
    capturedLive: boolean('captured_live').default(true).notNull(),
    /**
     * The verification record this photo was published from.
     *
     * NULLABLE, and the null case is meaningful rather than merely permitted:
     * rows that predate verification have no upload record, and backfilling one
     * would assert a check that never happened. A null here reads as "never
     * verified", which is the truth about every photo created before this
     * feature shipped.
     */
    uploadId: uuid('upload_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('report_photos_report_id_idx').on(table.reportId),
    index('report_photos_upload_id_idx').on(table.uploadId),
  ],
);

export const reportRelations = relations(reports, ({ one, many }) => ({
  reporter: one(user, { fields: [reports.reporterId], references: [user.id] }),
  category: one(reportCategories, {
    fields: [reports.categoryId],
    references: [reportCategories.id],
  }),
  status: one(reportStatuses, {
    fields: [reports.statusId],
    references: [reportStatuses.id],
  }),
  photos: many(reportPhotos),
}));

export const reportPhotoRelations = relations(reportPhotos, ({ one }) => ({
  report: one(reports, {
    fields: [reportPhotos.reportId],
    references: [reports.id],
  }),
}));
