/**
 * Where in the mobile app a sponsor's creative appears.
 *
 * THE KEYS ARE THE CONTRACT. THE LABELS ARE FOR THE OPERATOR.
 * ───────────────────────────────────────────────────────────────────────────
 * `placements` is `string[]` on the wire, and the four values below are spelled
 * exactly as the API and the mobile app spell them. Everything in this feature
 * renders `label` and sends `key` — never the other way round. Sending
 * "Home feed" where the app expects `home` produces a campaign that is stored
 * successfully and appears nowhere, which is the worst failure available here:
 * silent, and invisible until somebody notices the sponsor never ran.
 *
 * WHY AN UNKNOWN KEY STILL RENDERS
 * ───────────────────────────────────────────────────────────────────────────
 * `placementLabel()` falls back to the raw key rather than dropping it. If the
 * backend adds a fifth placement before this console is redeployed, a sponsor
 * using it must not look like a sponsor with one fewer placement — an operator
 * would "fix" it by re-ticking the boxes and silently delete the new placement
 * on save. Showing the raw key is ugly and honest; hiding it is neither.
 *
 * The editor only offers the four it knows. That is deliberate: a checkbox for
 * a placement whose meaning this build cannot state is a control an operator
 * cannot use responsibly.
 */

export type PlacementDef = {
  /** Sent to the API verbatim. Never translated, never title-cased. */
  key: string;
  label: string;
  /** Where this actually renders in the mobile app, in one line. */
  hint: string;
};

/**
 * The four the contract names. `docs/webadmin/08-monetization.md` §4 records
 * that the admin's placement vocabulary and the mobile app's `<SponsorCard
 * placement="…">` props already agree — the two sides simply never shared data.
 * Keeping the spelling identical is what makes wiring them a one-endpoint job.
 */
export const PLACEMENTS: readonly PlacementDef[] = [
  {
    key: "home",
    label: "Home feed",
    hint: "In the main request feed on the app's home tab.",
  },
  {
    key: "community_impact",
    label: "Community impact",
    hint: "On the community impact surface.",
  },
  {
    key: "impact_stories",
    label: "Impact stories",
    hint: "Between story cards in the Impact Stories list.",
  },
  {
    key: "category_list",
    label: "Category list",
    hint: "Among the results when browsing a request category.",
  },
] as const;

const LABELS = new Map(PLACEMENTS.map((placement) => [placement.key, placement.label]));

/** The operator-facing name, or the raw key when this build has not heard of it. */
export function placementLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

/**
 * Sort a sponsor's placements into the canonical order above, with any
 * unrecognised key last.
 *
 * The API is free to return them in whatever order they were stored, and a
 * table whose "Placements" cell reads differently between two rows carrying the
 * same set is a cell an operator has to read word by word instead of at a
 * glance.
 */
export function orderPlacements(keys: readonly string[]): string[] {
  const rank = new Map(PLACEMENTS.map((placement, index) => [placement.key, index]));
  return [...keys].sort((a, b) => {
    const left = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const right = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.localeCompare(b);
  });
}
