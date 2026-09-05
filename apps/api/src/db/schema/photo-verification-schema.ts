// Quarantine + verdict for a report photo, from capture until it publishes,
// is refused, or a moderator decides.
//
// WHY A SEPARATE TABLE RATHER THAN COLUMNS ON `report_photos`. Two reasons, and
// the first is structural rather than stylistic:
//
//   1. `report_photos.report_id` is NOT NULL. A photo cannot exist there before
//      its report does — but verification has to happen BEFORE the report is
//      created, or the gate is not a gate. The verdict needs somewhere to live
//      while there is no report to hang it on.
//
//   2. `report_photos` holds ~251 live rows. Adding a NOT NULL status FK to a
//      populated table means a hand-written backfill in the generated SQL, and
//      whatever value got backfilled would be a lie: those photos were never
//      verified by anything. Leaving them alone is the honest representation.
//
// A row here outlives the upload. It is the audit record of what was decided
// about an image and why, and it survives the file itself — `stored_filename`
// points at bytes that are deleted once a rejection's retention window closes,
// while the decision, its reasons and the moderator who made it remain.

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
import { reportCategories, reports } from './reports-schema';

/**
 * Lookup table, per CLAUDE.md § Database — not a text enum.
 *
 * Seeded keys: `verifying`, `passed`, `review_required`, `rejected`, `failed`.
 * `failed` is distinct from `review_required` on purpose: both put the photo in
 * front of a human, but only one of them means the provider never answered, and
 * an operator investigating a queue that has suddenly filled up needs to be able
 * to tell "the model is flagging things" from "Rekognition is down".
 */
export const photoVerificationStatuses = pgTable(
  'photo_verification_statuses',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const photoUploads = pgTable(
  'photo_uploads',
  {
    id: uuid('id').primaryKey(),

    // SET NULL, matching `reports.reporter_id`: deleting an account anonymises
    // its history rather than destroying the moderation record.
    uploaderId: text('uploader_id').references(() => user.id, {
      onDelete: 'set null',
    }),

    statusId: uuid('status_id')
      .notNull()
      .references(() => photoVerificationStatuses.id),

    /**
     * The category the uploader had selected when this photo was verified.
     *
     * Stored rather than read through the report, because it is an INPUT to the
     * verdict — category relevance was judged against it — and because at
     * verification time there is no report yet. If the reporter later switches
     * category, the recorded verdict still says what it was actually judged on.
     */
    categoryId: uuid('category_id').references(() => reportCategories.id),

    /** Filename inside QUARANTINE_DIR, or inside UPLOADS_DIR once promoted. */
    storedFilename: text('stored_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),

    /** Exact-duplicate signal. Indexed — it is looked up on every upload. */
    sha256: text('sha256').notNull(),
    /** dHash, 16 hex chars. Near-duplicate signal; compared by Hamming distance. */
    phash: text('phash').notNull(),

    /** 'pass' | 'review' | 'reject' — the backend's verdict, never the client's. */
    decision: text('decision'),
    /** 'low' | 'medium' | 'high'. */
    riskLevel: text('risk_level'),
    /** DecisionReason[] — codes, never prose. Both surfaces render their own wording. */
    reasons: jsonb('reasons').$type<string[]>(),
    /**
     * The summarised signal set, NOT the provider's raw response.
     *
     * Raw Rekognition output runs to hundreds of labels and, through scene
     * detection, incidental detail about people in the photograph. Persisting it
     * would be a privacy liability with no operational use: what a moderator
     * needs is the band each category landed in.
     */
    signals: jsonb('signals').$type<Record<string, unknown>>(),

    /** Which implementation produced the verdict, and which model version. */
    provider: text('provider'),
    moderationModelVersion: text('moderation_model_version'),
    labelModelVersion: text('label_model_version'),
    /** Set when the verdict came from a failure to analyse rather than a result. */
    unavailableReason: text('unavailable_reason'),

    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    /**
     * Set once the photo is attached to a report. Nullable for the whole window
     * between capture and submission — which is the window this table exists for.
     */
    reportId: uuid('report_id').references(() => reports.id, {
      onDelete: 'cascade',
    }),

    // Moderator decision. Separate from the machine verdict above so that
    // "the model said review, a human approved it" stays legible afterwards —
    // overwriting `decision` would erase why it was ever queued.
    reviewedById: text('reviewed_by_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewReason: text('review_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('photo_uploads_uploader_id_idx').on(table.uploaderId),
    index('photo_uploads_status_id_idx').on(table.statusId),
    // Every upload does an exact-duplicate lookup on this.
    index('photo_uploads_sha256_idx').on(table.sha256),
    index('photo_uploads_report_id_idx').on(table.reportId),
    // The moderation queue's default ordering.
    index('photo_uploads_created_at_idx').on(table.createdAt),
  ],
);

export const photoUploadRelations = relations(photoUploads, ({ one }) => ({
  uploader: one(user, {
    fields: [photoUploads.uploaderId],
    references: [user.id],
    relationName: 'photoUploadUploader',
  }),
  reviewedBy: one(user, {
    fields: [photoUploads.reviewedById],
    references: [user.id],
    relationName: 'photoUploadReviewer',
  }),
  status: one(photoVerificationStatuses, {
    fields: [photoUploads.statusId],
    references: [photoVerificationStatuses.id],
  }),
  category: one(reportCategories, {
    fields: [photoUploads.categoryId],
    references: [reportCategories.id],
  }),
  report: one(reports, {
    fields: [photoUploads.reportId],
    references: [reports.id],
  }),
}));
