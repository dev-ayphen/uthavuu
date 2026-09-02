// Monetization -> Sponsors: the campaigns the mobile app's <SponsorCard>
// renders, and the console surface that manages them.
//
// WHY THIS TABLE EXISTS AT ALL. docs/webadmin/08-monetization.md §4 records the
// one gap this schema closes: the admin console modelled sponsors with
// placements, dates and a status, the mobile app rendered
// `<SponsorCard placement="home" />` from its own 2-record hardcoded constant,
// and "the two sides use the same vocabulary and share no data". The placement
// keys below are not new names — they are the props the mobile component
// already takes. That is why §5 gap #1 calls this "the lowest-effort,
// highest-value integration in the console": the shapes already agreed, only
// the data was missing.
//
// WHAT IS DELIBERATELY ABSENT: `views` and `clicks`. The prototype carried both
// (12,840 / 342 on its first mock record) and §4.1 calls them "fictional twice
// over" — the mobile app reports no impressions, so a counter column could only
// ever display a number nothing in this system can produce. A column whose only
// possible value is decorative is worse than no column, because it looks like
// evidence. If impression tracking is ever built it gets its own table (one row
// per event, not a counter to increment) and its own decision; it does not get
// bolted here.
import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * draft | scheduled | active | paused | expired — the console's five status
 * filter tabs (docs/webadmin/08-monetization.md §3.2), minus "all".
 *
 * A lookup table referenced by FK, per CLAUDE.md § Database — the same shape as
 * `community_update_statuses` and `user_statuses`.
 *
 * ⚠️ ONLY THREE OF THE FIVE KEYS ARE EVER WRITTEN TO `sponsors.status_id`.
 * `scheduled` and `expired` are DERIVED from the campaign window at read time
 * and never stored — see sponsors/sponsor-status.ts, which is the specification
 * for that rule and explains why. They are seeded regardless, for the reason
 * ADR 0012 gives for using lookup tables at all: the console's status filter
 * needs a complete, ordered catalogue on day one, and `select distinct` over
 * whatever has happened so far cannot provide one. A derived value still needs
 * a label to render.
 *
 * `sort_order` matches the console's tab order exactly (§3.2 #1: active,
 * scheduled, paused, expired, draft), so the filter renders in the order it was
 * designed in without the client re-sorting.
 */
export const sponsorStatuses = pgTable('sponsor_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * video | banner | logo_text — what kind of creative the card renders.
 *
 * A lookup rather than a text enum for the same reason as the statuses: it is a
 * value the console filters and labels. Note `logo_text` (snake_case), not the
 * prototype's `'logo-text'`: every other lookup key in this database is
 * snake_case, and one hyphenated outlier is the kind of detail a client
 * hardcodes wrong exactly once.
 */
export const sponsorCreativeTypes = pgTable('sponsor_creative_types', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sponsors = pgTable(
  'sponsors',
  {
    id: uuid('id').primaryKey(),

    // The only NOT NULL field of the campaign copy. Everything else is
    // genuinely optional: a sponsor can be entered from a phone call with
    // nothing but a name and filled in later, and the wizard
    // (docs/webadmin/08-monetization.md §3.4) is six steps precisely because
    // the information arrives in pieces.
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    description: text('description'),
    website: text('website'),
    category: text('category'),
    campaignName: text('campaign_name'),
    location: text('location'),

    // NOT NULL, unlike the rest of the copy — and that asymmetry is deliberate.
    // `logo_text` IS the no-creative-asset state: a card that shows the logo and
    // the description and nothing else. So "this sponsor has no creative type"
    // is not a real state, it is `logo_text` spelled as a null. Making the
    // column nullable would push a branch into the mobile renderer for a case
    // the lookup table already names, which is how a card ends up rendering
    // blank instead of rendering the fallback.
    creativeTypeId: uuid('creative_type_id')
      .notNull()
      .references(() => sponsorCreativeTypes.id),
    // Nullable, and it must stay nullable: a `logo_text` creative has no asset
    // to point at. The pairing rule (video/banner need a URL) is enforced in
    // the DTO — see admin/dto/create-sponsor.dto.ts — and NOT in the database.
    // There is no CHECK constraint; the DTO and the service's merged re-check
    // are the only two guards.
    creativeUrl: text('creative_url'),

    // The campaign window. Both nullable, and the two nulls mean different
    // things — the same model updates-schema.ts uses, for the same reason:
    //
    //   start_date NULL -> live the moment it is activated.
    //   end_date   NULL -> runs until somebody pauses it.
    //
    // NEITHER IS A STATUS. A campaign booked for next month is stored `active`
    // with a future `start_date`, and it is the read query — not a cron job —
    // that decides it is not visible yet. Nothing has to run on time for the
    // schedule to be correct, which is what §5 gap #6 ("campaign dates do
    // nothing… campaigns must be paused by hand") was actually asking for.
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),

    // Holds `draft`, `active` or `paused` and nothing else. See the warning on
    // sponsorStatuses above and the full rule in sponsors/sponsor-status.ts.
    statusId: uuid('status_id')
      .notNull()
      .references(() => sponsorStatuses.id),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),

    // Soft delete, added deliberately rather than by habit (CLAUDE.md: "add it
    // per-table, deliberately"). This table earns it the same way
    // `community_updates` does: a sponsor is a commercial relationship with an
    // outside organisation, so "what exactly was the campaign we took down, and
    // when" is a question asked after the fact — sometimes by the sponsor. The
    // `sponsor.delete` audit row records who and when; keeping the row keeps
    // the terms. A hard delete would also leave that audit entry pointing at
    // nothing (audit target_id is deliberately not an FK — ADR 0012).
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // The citizen read: status = active AND start/end window open. Leading with
    // status_id because it is the equality predicate; the two dates are ranges.
    index('sponsors_status_window_idx').on(
      table.statusId,
      table.startDate,
      table.endDate,
    ),
    // The console's default view, newest first, unfiltered.
    index('sponsors_created_at_idx').on(table.createdAt),
  ],
);

/**
 * Which surfaces a sponsor appears on. One row per (sponsor, placement).
 *
 * WHY A JOIN TABLE AND NOT FOUR BOOLEAN COLUMNS: the prototype's mock carried
 * `placements { home, communityImpact, impactStories, categoryList }` as an
 * object of flags, which is four columns that must all be migrated to add a
 * fifth surface, and which cannot answer "what is on the home feed" without
 * scanning every sponsor. A row per placement makes the citizen query an
 * indexed equality on the placement key.
 *
 * WHY `placement_key` IS *NOT* A LOOKUP TABLE, when the two above are.
 * CLAUDE.md's rule is that *status and category values* live in lookup tables,
 * and the test behind that rule is "can an operator meaningfully add or rename
 * one without a code change?". For statuses and creative types the answer is
 * yes. For placements it is emphatically no: a placement key is the prop of a
 * React Native component (`<SponsorCard placement="home" />`), so adding one
 * means shipping a mobile release. A lookup row for a placement the app has no
 * renderer for would be a selectable option in the console that silently shows
 * a sponsor to nobody — the exact decorative-data failure §4.1 documents. The
 * closed union below is the contract, and the admin DTO validates against it.
 * The database has no CHECK constraint; the DTO is the only guard.
 */
export const sponsorPlacements = pgTable(
  'sponsor_placements',
  {
    id: uuid('id').primaryKey(),
    // CASCADE, unlike almost every other FK in this schema. A placement row has
    // no meaning without its sponsor — it is not a record of anything that
    // happened, just the sponsor's own configuration — so there is nothing to
    // preserve. (The sponsor itself is soft-deleted, so this cascade only fires
    // on a genuine hard delete, which nothing in the API performs today.)
    sponsorId: uuid('sponsor_id')
      .notNull()
      .references(() => sponsors.id, { onDelete: 'cascade' }),
    placementKey: text('placement_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // The set semantics, enforced by the database rather than by remembering to
    // de-duplicate in the service. "Show this sponsor on the home feed" is true
    // or false, never true twice — and a duplicate row would render the same
    // card twice in one list.
    unique('sponsor_placements_sponsor_placement_key').on(
      table.sponsorId,
      table.placementKey,
    ),
    // The citizen read starts here: given a placement, which sponsors?
    index('sponsor_placements_placement_key_idx').on(table.placementKey),
  ],
);

export const sponsorStatusRelations = relations(
  sponsorStatuses,
  ({ many }) => ({
    sponsors: many(sponsors),
  }),
);

export const sponsorCreativeTypeRelations = relations(
  sponsorCreativeTypes,
  ({ many }) => ({ sponsors: many(sponsors) }),
);

export const sponsorRelations = relations(sponsors, ({ one, many }) => ({
  status: one(sponsorStatuses, {
    fields: [sponsors.statusId],
    references: [sponsorStatuses.id],
  }),
  creativeType: one(sponsorCreativeTypes, {
    fields: [sponsors.creativeTypeId],
    references: [sponsorCreativeTypes.id],
  }),
  placements: many(sponsorPlacements),
}));

export const sponsorPlacementRelations = relations(
  sponsorPlacements,
  ({ one }) => ({
    sponsor: one(sponsors, {
      fields: [sponsorPlacements.sponsorId],
      references: [sponsors.id],
    }),
  }),
);

export type Sponsor = typeof sponsors.$inferSelect;
export type NewSponsor = typeof sponsors.$inferInsert;
export type SponsorStatus = typeof sponsorStatuses.$inferSelect;
export type SponsorCreativeType = typeof sponsorCreativeTypes.$inferSelect;
export type SponsorPlacement = typeof sponsorPlacements.$inferSelect;

/**
 * The five seeded status keys, as a closed union.
 *
 * The runtime authority is the database (the rule admin-audit-catalogue.ts
 * states): the service resolves a key to an id by querying `sponsor_statuses`,
 * so a key listed here but never seeded fails loudly on first use. This union
 * exists so a typo at a call site is a compile error rather than a row nobody
 * can find.
 */
export const SPONSOR_STATUS_KEYS = [
  'active',
  'scheduled',
  'paused',
  'expired',
  'draft',
] as const;

export type SponsorStatusKey = (typeof SPONSOR_STATUS_KEYS)[number];

/**
 * The subset a row may actually hold — the ones some endpoint writes.
 *
 * Typed separately from SPONSOR_STATUS_KEYS so `statusIdFor()` cannot be called
 * with 'scheduled' or 'expired'. Storing either would be a lie the moment the
 * clock moved past the boundary, and it is what makes gap #6's "campaigns must
 * be paused by hand" true.
 */
export const SPONSOR_STORED_STATUS_KEYS = [
  'draft',
  'active',
  'paused',
] as const;

export type SponsorStoredStatusKey =
  (typeof SPONSOR_STORED_STATUS_KEYS)[number];

export const SPONSOR_CREATIVE_TYPE_KEYS = [
  'video',
  'banner',
  'logo_text',
] as const;

export type SponsorCreativeTypeKey =
  (typeof SPONSOR_CREATIVE_TYPE_KEYS)[number];

/**
 * The four surfaces a sponsor can appear on.
 *
 * These names are a CONTRACT WITH THE MOBILE APP, not a choice this file is
 * free to make: docs/webadmin/08-monetization.md §4 records that the console
 * and `<SponsorCard placement="…" />` already used exactly these, which is the
 * whole reason this integration is cheap. Renaming one silently empties a
 * surface in a shipped app. Add one only alongside the mobile renderer that
 * displays it.
 */
export const SPONSOR_PLACEMENT_KEYS = [
  'home',
  'community_impact',
  'impact_stories',
  'category_list',
] as const;

export type SponsorPlacementKey = (typeof SPONSOR_PLACEMENT_KEYS)[number];
