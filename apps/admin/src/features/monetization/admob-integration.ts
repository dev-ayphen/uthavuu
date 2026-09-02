/**
 * What is actually true about AdMob in this repository, today.
 *
 * READ THIS BEFORE CHANGING A SINGLE `false` BELOW
 * ───────────────────────────────────────────────────────────────────────────
 * These are RECORDED FACTS, not a live probe. Nothing in the console can
 * interrogate the mobile bundle or the API's environment for an AdMob key, so
 * this file states what a person checked, when they checked it, and with which
 * command — and the page that renders it says the same thing to the operator
 * rather than implying a health check ran.
 *
 * That distinction matters more here than almost anywhere else in the console.
 * `features/system-health/system-health-view.tsx` puts it as "a status page
 * that always says 'operational' is worse than no status page: it is a green
 * light wired to nothing". The same trap has an inverse, and this file sits in
 * it: a page hardcoded to say "not integrated" would go quietly wrong the day
 * somebody integrates AdMob. Two things protect against that. First, every
 * claim below carries the command that re-checks it in seconds. Second, none of
 * them can be flipped to `true` without also giving the console a real source
 * for the figures — because a `true` here still renders no earnings, it renders
 * "connected, and Google's numbers live over there".
 *
 * THE DURABLE FIX, when this stops being good enough: the API already reports
 * `msg91Configured`, `fcmConfigured` and friends through
 * `GET /admin/system-health` (`config.*`), which is a live read of the server's
 * own environment. An `admobConfigured` flag belongs in that payload, and this
 * file collapses into the mobile-SDK line alone once it exists. That is a
 * change to `apps/api`, which is why it is written down here instead of done.
 *
 * WHAT WAS CHECKED, AND WHAT WAS FOUND (2026-09-02)
 * ───────────────────────────────────────────────────────────────────────────
 *   apps/mobile/package.json           no Google Mobile Ads dependency of any
 *                                      kind. Not `react-native-google-mobile-ads`,
 *                                      not `expo-ads-admob`. 30 dependencies,
 *                                      none of them an ad SDK.
 *   apps/api/.env.example              no AdMob variable. It carries DATABASE_URL,
 *                                      REDIS_URL, BETTER_AUTH_*, MSG91_*, FCM_*,
 *                                      ADMIN_URL and the seed passwords. Nothing
 *                                      else.
 *   grep -ri admob / ca-app-pub        across the repo, excluding node_modules
 *   over apps/ and libs-*              and docs: the only hits are this console's
 *                                      own nav label and this feature. No unit
 *                                      id, no publisher id, no SDK call.
 *
 * `ca-app-pub-3940256099942544` — Google's public sample publisher id, which the
 * prototype shipped for all six of its placements (`docs/webadmin/08-monetization.md`
 * §2.2, gap #2) — appears nowhere in this repository, and must never reach the
 * UI. It serves test ads and earns nothing, and rendering it in a table of "ad
 * units" is how a test id ships to production unnoticed. It is named here, in a
 * comment, exactly so nobody re-adds it thinking it is inventory.
 */

/** ISO date the claims in this file were last verified against the repo. */
export const ADMOB_FACTS_VERIFIED_ON = "2026-09-02";

export type AdmobPrerequisite = {
  label: string;
  /** True only when something in this repository actually provides it. */
  present: boolean;
  /** What is (or is not) there — stated as the fact, never as a promise. */
  detail: string;
  /** The command that re-checks it. Rendered so the claim is falsifiable. */
  check: string;
};

/**
 * The three things that must all be true before this console could display a
 * single AdMob figure. Every one is `false`, and each is false for its own
 * reason — collapsing them into one "not set up" line would hide that the SDK
 * is the long pole and the credentials are the cheap part.
 */
export const ADMOB_PREREQUISITES: AdmobPrerequisite[] = [
  {
    label: "Ad SDK in the mobile app",
    present: false,
    detail:
      "apps/mobile has no Google Mobile Ads SDK. Nothing in the app can request, render or count an ad, so no impression exists to be reported anywhere.",
    check: "grep -i admob apps/mobile/package.json",
  },
  {
    label: "AdMob account and app IDs",
    present: false,
    detail:
      "No publisher id and no per-platform app id exist in the API's environment. There is no AdMob account wired to this product.",
    check: "grep -i admob apps/api/.env.example",
  },
  {
    label: "Reporting connection to Google",
    present: false,
    detail:
      "Nothing calls Google's AdMob reporting API, so there are no Google-reported figures for this console to display. Earnings can only ever be read from the AdMob dashboard.",
    check: "grep -ri admob apps/api/src",
  },
];

/** True only when every prerequisite is met. Derived — never written by hand. */
export const ADMOB_IS_INTEGRATED = ADMOB_PREREQUISITES.every((item) => item.present);

/** Where the money actually is. The console links out; it never embeds this. */
export const ADMOB_CONSOLE_URL = "https://apps.admob.com/";

/**
 * The order in which AdMob money moves, and where this console sits in it.
 *
 * Written as four steps because the fourth is the one that keeps getting lost:
 * every figure this console could ever show would be a figure Google already
 * calculated. The backend has no formula for ad revenue and must never grow
 * one — an internally-computed "estimated earnings" that disagrees with the
 * AdMob dashboard is a number two people will argue about, and the console
 * would lose.
 */
export const ADMOB_MONEY_PATH = [
  {
    actor: "Google",
    text: "Google's ad network decides which ad to serve into a slot in the mobile app and serves it. Uthavu picks the slot; it never picks the ad.",
  },
  {
    actor: "Google",
    text: "Google counts the impression, the click and what the advertiser paid. That measurement happens inside Google's SDK and Google's servers — no Uthavu code observes it.",
  },
  {
    actor: "Google",
    text: "Earnings accrue in the AdMob dashboard and are paid out by Google on Google's schedule. Money never passes through this system.",
  },
  {
    actor: "This console",
    text: "At best, this console fetches Google's already-final figures through the AdMob reporting API and displays them. It cannot calculate ad revenue, and any number here that Google did not send would be invented.",
  },
] as const;

/**
 * What persisting ad configuration would need — reported, not built.
 *
 * `docs/webadmin/08-monetization.md` §2.3 is the reason there is not a single
 * switch on the AdMob page. The prototype shipped six placement toggles whose
 * on/off state came from an array index and two Save buttons that were
 * `alert()` calls; the platform-settings post-mortem next door (§2A of
 * `07-platform-settings.md`) counts eleven toggles with no handler at all and
 * names the worst of them: "a switch that looks like a stop button and isn't
 * one is worse than no switch." A control that persists nothing is not a
 * placeholder for a control — it is a false statement about the system.
 *
 * So the section renders as read-only text and the requirements live here.
 * NOTE the second item especially: this almost certainly does NOT need a new
 * table or a migration. `platform_settings` is already the console's
 * one-row-of-runtime-configuration table, and its own header states the rule
 * these keys would have to satisfy — "a column exists only if something in this
 * codebase reads it and changes behaviour". Nothing reads an AdMob setting
 * today because there is no SDK to read it, which is exactly why the setting
 * must not be added yet.
 */
export const ADMOB_PERSISTENCE_REQUIREMENTS = [
  "A renderer in the mobile app for each ad format, so that a placement toggle has something to turn on in the first place.",
  "Columns on platform_settings — not a new table and not migration 0022, which the sponsors module is holding. That table is the console's existing home for runtime configuration, and its rule is that a column exists only if something in this codebase reads it and changes behaviour.",
  "A read point in apps/api that enforces each value, named in the schema comment the way max_photos_per_report names ReportsService.create. A setting with no enforcement point is the prototype's problem with extra steps.",
  "The AdMob reporting API and a Google service account, if this console is ever to display earnings rather than link to them.",
] as const;
