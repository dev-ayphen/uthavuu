import { CATEGORY_COLORS } from '../theme/tokens';

// docs/features/report-a-request.md US-1: 8 citizen-selectable categories.
// Disaster Relief is deliberately absent — admin-only, per BR-3.
//
// ⚠️ THIS LIST IS A FALLBACK, NOT THE TAXONOMY. The categories a citizen sees
// come from `GET /reports/categories` via `useCategories()`. This array is what
// renders before that request resolves, and if it fails.
//
// It used to BE the taxonomy, rendered directly by the Dashboard grid, the
// Discover chip row and the report-flow picker — which meant the admin console
// was wrong when it said "an edit here changes what citizens see, with no
// deploy" (admin-categories.service.ts). Renaming a category updated report
// CARDS (those read `report.category.label` from the server) and left the grid
// alone; creating one was invisible on mobile entirely. Keep this in sync as a
// courtesy, but nothing here decides what exists.
/** The keys this build ships copy and a colour for. */
export type KnownCategoryId =
  | 'animalRescue'
  | 'medicalHelp'
  | 'foodDonation'
  | 'roadsideHelp'
  | 'elderlySupport'
  | 'bloodDonation'
  | 'communityHelp'
  | 'lostAndFound';

/**
 * A category key as it arrives from the server — OPEN, not closed.
 *
 * `report_categories` is a table an admin writes to, so the set of keys is not
 * knowable at build time; a closed union here made the compiler enforce a
 * taxonomy the server does not have, and a category created after this version
 * shipped was a type error rather than a new tile.
 *
 * `(string & {})` rather than a plain `string` so editors still autocomplete
 * the eight known keys and a typo in a literal is still visible, while any
 * server-issued key type-checks.
 */
export type CategoryId = KnownCategoryId | (string & {});

export const CATEGORIES: Array<{ id: KnownCategoryId; title: string; emoji: string; color: string }> = [
  { id: 'animalRescue', title: 'Animal Rescue', emoji: '🐶', color: CATEGORY_COLORS.animalRescue },
  { id: 'medicalHelp', title: 'Medical Help', emoji: '❤️', color: CATEGORY_COLORS.medicalHelp },
  { id: 'foodDonation', title: 'Food Donation', emoji: '🍱', color: CATEGORY_COLORS.foodDonation },
  { id: 'roadsideHelp', title: 'Roadside Help', emoji: '🚗', color: CATEGORY_COLORS.roadsideHelp },
  { id: 'elderlySupport', title: 'Elderly Support', emoji: '👴', color: CATEGORY_COLORS.elderlySupport },
  { id: 'bloodDonation', title: 'Blood Donation', emoji: '🩸', color: CATEGORY_COLORS.bloodDonation },
  { id: 'communityHelp', title: 'Community Help', emoji: '🤝', color: CATEGORY_COLORS.communityHelp },
  { id: 'lostAndFound', title: 'Lost & Found', emoji: '🔍', color: CATEGORY_COLORS.lostAndFound },
];


/**
 * The tile colour for a category key.
 *
 * Separate from the list above because colour is a CLIENT concern — the API has
 * no colour column and should not grow one — while the set of keys is the
 * server's. A key this build has never seen (a category an admin created after
 * this version shipped) gets the neutral fallback and renders correctly rather
 * than crashing on an undefined lookup.
 */
export function categoryColor(key: string): string {
  return (
    (CATEGORY_COLORS as Record<string, string | undefined>)[key] ??
    CATEGORY_COLORS.communityHelp
  );
}

/** A category as the tiles/chips/picker render it, whatever its source. */
export type CategoryTile = {
  id: string;
  title: string;
  emoji: string;
  color: string;
};

/** The fallback list in tile shape, so callers have one type to handle. */
export const FALLBACK_CATEGORY_TILES: CategoryTile[] = CATEGORIES.map((c) => ({
  id: c.id,
  title: c.title,
  emoji: c.emoji,
  color: c.color,
}));
