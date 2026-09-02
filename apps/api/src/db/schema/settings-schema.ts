// Platform -> App Settings: the one row of runtime configuration an operator
// can change from the console without a deploy.
//
// WHY THIS TABLE IS SMALL, AND WHY THAT IS THE POINT.
//
// docs/webadmin/07-platform-settings.md §2A is a post-mortem of the prototype's
// version of this screen: a 35-key settings object of which "every one" was
// disconnected, and eleven toggles with no handler at all. §5A.3 names the worst
// case — `maintenanceMode`, "a switch that looks like a stop button and isn't
// one is worse than no switch."
//
// So the rule for this table is: A COLUMN EXISTS ONLY IF SOMETHING IN THIS
// CODEBASE READS IT AND CHANGES BEHAVIOUR. Every column below has a named
// enforcement point:
//
//   app_name                   -> GET /config (mobile chrome)
//   support_email/phone        -> GET /config (mobile Help screen contact)
//   max_photos_per_report      -> ReportsService.create/addPhoto/update
//   max_volunteers_per_report  -> ReportsService.create/update
//   default_radius_km          -> GET /config (mobile discovery default)
//   allow_anonymous_reports    -> ReportsService.create/update
//   comments_enabled           -> CommentsService.create
//   comment_flagging_enabled   -> CommentsService.flag
//   maintenance_mode           -> MaintenanceGuard (global, blocks citizen writes)
//   read_only_mode             -> MaintenanceGuard (global, blocks citizen writes)
//
// Settings the prototype had and this table deliberately does NOT have, because
// nothing here could enforce them: `expiryHours` (per-category
// `report_categories.default_expiry_minutes` already owns expiry, and a global
// value would contradict it), `minReliability` (no reliability score exists),
// `profanityFilter` / `imageModeration` / `duplicateDetection` (no such
// pipeline), `smtpEnabled` (no email provider — ADR 0003),
// `firebaseEnabled` / `broadcastEnabled` (no FCM sender exists yet),
// `googleLogin` / `appleLogin` (phone OTP is the only citizen sign-in), and
// `enableLikes` (Like was removed outright in migration 0016 — a flag for it
// would resurrect a killed feature).
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * The bounds every writer enforces.
 *
 * Declared once here so the Zod DTO
 * (admin/dto/update-platform-settings.dto.ts), the CHECK constraints below and
 * the seed all read the same numbers. Two copies of "1..10" is how a settings
 * screen ends up able to save a value the API then rejects.
 */
export const PLATFORM_SETTINGS_BOUNDS = {
  appName: { minLength: 1, maxLength: 80 },
  maxPhotosPerReport: { min: 1, max: 10 },
  maxVolunteersPerReport: { min: 1, max: 50 },
  /**
   * Not a range. These are the four radius chips the mobile discovery screen
   * offers (docs/API-CONTRACT.md, mobile Dashboard) — 2 km is not a value the
   * client can render, so it is not a value this column may hold.
   */
  defaultRadiusKmOptions: [1, 3, 5, 10],
} as const;

/**
 * The values the singleton row is seeded with, and the values the reader falls
 * back to when the row is absent (see config/platform-settings.ts).
 *
 * These are the SAME constants the column defaults below use, so "seeded" and
 * "defaulted" cannot drift into meaning different things.
 */
export const PLATFORM_SETTINGS_DEFAULTS = {
  appName: 'Uthavu',
  supportEmail: null,
  supportPhone: null,
  maxPhotosPerReport: 4,
  maxVolunteersPerReport: 20,
  defaultRadiusKm: 5,
  allowAnonymousReports: true,
  commentsEnabled: true,
  commentFlaggingEnabled: true,
  // Both kill switches default OFF. A fresh database must never come up in
  // maintenance — see the fail-open note in config/platform-settings.ts.
  maintenanceMode: false,
  readOnlyMode: false,
} as const;

export const platformSettings = pgTable(
  'platform_settings',
  {
    id: uuid('id').primaryKey(),

    /**
     * The singleton guard. There is exactly one row of platform configuration,
     * and "exactly one" is enforced by the database rather than by everybody
     * remembering to write `limit 1`.
     *
     * UNIQUE + `CHECK (singleton)` together: the check forbids `false`, so the
     * only value the column can hold is `true`, and the unique index then
     * permits only one row holding it. A second `insert` fails with a
     * constraint violation instead of quietly creating a second configuration
     * that half the process would read and half would not.
     *
     * Chosen over a hardcoded well-known uuid because that only works while
     * every writer remembers the magic constant; this one holds even for a
     * hand-typed `INSERT` in psql.
     */
    singleton: boolean('singleton')
      .notNull()
      .default(true)
      .unique('platform_settings_singleton_key'),

    // --- General -----------------------------------------------------------
    appName: text('app_name')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.appName),
    // Nullable, and null is the normal state: this product has no email
    // provider (ADR 0003), so a support email is a string shown to citizens,
    // not an address anything sends to.
    supportEmail: text('support_email'),
    supportPhone: text('support_phone'),

    // --- Reports -----------------------------------------------------------
    maxPhotosPerReport: integer('max_photos_per_report')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.maxPhotosPerReport),
    maxVolunteersPerReport: integer('max_volunteers_per_report')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.maxVolunteersPerReport),
    defaultRadiusKm: integer('default_radius_km')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.defaultRadiusKm),
    allowAnonymousReports: boolean('allow_anonymous_reports')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.allowAnonymousReports),

    // --- Community ---------------------------------------------------------
    commentsEnabled: boolean('comments_enabled')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.commentsEnabled),
    commentFlaggingEnabled: boolean('comment_flagging_enabled')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.commentFlaggingEnabled),

    // --- Kill switches -----------------------------------------------------
    // Both are read by MaintenanceGuard on EVERY mutating citizen request. They
    // are the two columns §5A.3 is about: if either of these is ever a stored
    // boolean nothing consults, this whole table has repeated the prototype.
    maintenanceMode: boolean('maintenance_mode')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.maintenanceMode),
    readOnlyMode: boolean('read_only_mode')
      .notNull()
      .default(PLATFORM_SETTINGS_DEFAULTS.readOnlyMode),

    /**
     * Who last changed the configuration.
     *
     * `text`, not `uuid`: Better Auth owns `user.id` and it is a text column.
     *
     * ON DELETE SET NULL, never CASCADE — the same reasoning as
     * `admin_audit_logs.actor_user_id` and `community_updates.author_admin_user_id`.
     * Deleting a departed admin's account must not delete the platform's
     * configuration along with them.
     *
     * NULL is therefore ambiguous on its own — "never changed by anybody" and
     * "changed by somebody whose account is now gone" look identical. The
     * projection disambiguates with `updated_at > created_at`; see
     * AdminSettingsService.toResponse(). The durable answer to "who set
     * maintenance mode" is the `platform_setting.update` audit row, which
     * snapshots the actor's name, email and role and survives their deletion.
     */
    updatedBy: text('updated_by').references(() => user.id, {
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
    // The singleton half that UNIQUE cannot express on its own.
    check('platform_settings_singleton_true', sql`${table.singleton}`),

    // The bounds, in the database as well as in the DTO. This is deliberate
    // belt-and-braces, and the two layers have different jobs: the Zod DTO
    // exists so a console operator gets a clean 400 naming the field, and these
    // exist so the invariant still holds for a psql session, a future admin
    // script, or a DTO someone loosens by accident. Neither is redundant.
    check(
      'platform_settings_app_name_length',
      sql`char_length(${table.appName}) between ${sql.raw(String(PLATFORM_SETTINGS_BOUNDS.appName.minLength))} and ${sql.raw(String(PLATFORM_SETTINGS_BOUNDS.appName.maxLength))}`,
    ),
    check(
      'platform_settings_max_photos_range',
      sql`${table.maxPhotosPerReport} between ${sql.raw(String(PLATFORM_SETTINGS_BOUNDS.maxPhotosPerReport.min))} and ${sql.raw(String(PLATFORM_SETTINGS_BOUNDS.maxPhotosPerReport.max))}`,
    ),
    check(
      'platform_settings_max_volunteers_range',
      sql`${table.maxVolunteersPerReport} between ${sql.raw(String(PLATFORM_SETTINGS_BOUNDS.maxVolunteersPerReport.min))} and ${sql.raw(String(PLATFORM_SETTINGS_BOUNDS.maxVolunteersPerReport.max))}`,
    ),
    check(
      'platform_settings_default_radius_km_allowed',
      sql`${table.defaultRadiusKm} in (${sql.raw(PLATFORM_SETTINGS_BOUNDS.defaultRadiusKmOptions.join(', '))})`,
    ),
  ],
);

export const platformSettingsRelations = relations(
  platformSettings,
  ({ one }) => ({
    updatedByUser: one(user, {
      fields: [platformSettings.updatedBy],
      references: [user.id],
    }),
  }),
);

export type PlatformSettingsRow = typeof platformSettings.$inferSelect;
export type NewPlatformSettings = typeof platformSettings.$inferInsert;
