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
  /**
   * Does a screen in `apps/mobile` actually MOUNT an ad slot for this key?
   *
   * See `PLACEMENT_DELIVERY_VERIFIED_ON` below for what was checked and how to
   * re-check it. A placement the API accepts is not the same thing as a
   * placement a citizen can see.
   */
  renderedByApp: boolean;
};

/**
 * ⚠ ONE OF THE FOUR PLACEMENTS RENDERS NOWHERE, AND THE EDITOR MUST SAY SO
 * ───────────────────────────────────────────────────────────────────────────
 * The four keys below are all real to the API: the DTO accepts them
 * (`apps/api/src/admin/dto/create-sponsor.dto.ts`), the citizen endpoint filters
 * on them, and `activate()`'s `SPONSOR_NO_PLACEMENTS` check is satisfied by any
 * one of them. But `community_impact` is mounted by NO SCREEN in the mobile app.
 * Checked 2026-09-02:
 *
 *     grep -rn '<SponsorAd' apps/mobile/src
 *       DashboardScreen.tsx:390        placement="home"
 *       MyImpactStoriesScreen.tsx:81   placement="impact_stories"
 *       CategoryListScreen.tsx:122     placement="category_list"
 *     grep -rn community_impact apps/mobile libs-mobile
 *       libs-mobile/api/ads.ts:61      (the constant only — no mount)
 *
 * So an operator can tick Community impact ALONE, clear the API's only
 * "appears somewhere" guard, activate, and ship a campaign that appears on no
 * screen in the product — the precise silent failure this feature exists to
 * end, reached through a control this console offered them.
 *
 * WHY IT IS FLAGGED RATHER THAN REMOVED. Two reasons, and the first is data
 * loss: dropping the checkbox would not drop the key from records that already
 * carry it, so an operator opening such a sponsor would see one fewer placement
 * than it has and silently delete it by pressing Save — the same failure
 * `sponsorToFormValues` refuses to cause with unknown keys. The second is that
 * the fix belongs in `apps/mobile` (mount the slot), not here; hiding the key
 * would make a missing renderer look like a decision nobody has to take.
 */
export const PLACEMENT_DELIVERY_VERIFIED_ON = "2026-09-02";

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
    renderedByApp: true,
  },
  {
    key: "community_impact",
    label: "Community impact",
    hint: "Intended for the community impact surface — but no screen in the app renders this slot yet.",
    renderedByApp: false,
  },
  {
    key: "impact_stories",
    label: "Impact stories",
    hint: "Between story cards in the Impact Stories list.",
    renderedByApp: true,
  },
  {
    key: "category_list",
    label: "Category list",
    hint: "Among the results when browsing a request category.",
    renderedByApp: true,
  },
] as const;

const UNDELIVERED = new Set(
  PLACEMENTS.filter((placement) => !placement.renderedByApp).map((placement) => placement.key),
);

/**
 * Is this key one this build KNOWS the app never renders?
 *
 * Note the direction: an UNKNOWN key returns `false`. This console cannot
 * testify about a placement a newer backend invented, and claiming "shows
 * nowhere" about one would be inventing a fault — the same fail-open choice
 * `placementLabel` makes when it prints a key it has not heard of.
 */
export function placementRendersNowhere(key: string): boolean {
  return UNDELIVERED.has(key);
}

/**
 * The keys on this campaign that no screen renders — and, separately, whether
 * that accounts for ALL of them.
 *
 * The second answer is the one that matters: a campaign carrying `home` and
 * `community_impact` runs perfectly well on the home feed and merely wastes a
 * tick box, while a campaign carrying `community_impact` alone runs nowhere at
 * all despite passing every check the API makes.
 */
export function placementDelivery(keys: readonly string[]): {
  undelivered: string[];
  showsNowhere: boolean;
} {
  const undelivered = keys.filter((key) => placementRendersNowhere(key));
  return {
    undelivered,
    showsNowhere: keys.length > 0 && undelivered.length === keys.length,
  };
}

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
