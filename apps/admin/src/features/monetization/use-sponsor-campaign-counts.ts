"use client";

import { useQuery } from "@tanstack/react-query";

import { ListShapeError, shouldRetryListError } from "@/components/data";
import { apiFetch } from "@/lib/api-client";

/**
 * How many sponsor campaigns exist, split by status — and NOTHING ELSE.
 *
 * THE RULE THIS FILE IS BUILT AROUND
 * ───────────────────────────────────────────────────────────────────────────
 * `docs/webadmin/08-monetization.md` §4.1 — "revenue reporting is fictional
 * twice over" — is a post-mortem of the screen this hook feeds. The prototype
 * showed 12,840 views and 342 clicks for a campaign while the mobile app
 * reported no impressions at all, and it showed rupee revenue derived from
 * those counts. Both numbers were furniture.
 *
 * So this hook returns COUNTS OF ROWS and nothing that resembles delivery or
 * money. A count of rows is the one figure the sponsors endpoint can actually
 * produce, and it produces it from `pagination.total`, which the database
 * computed. Everything else this screen might want to show is `null` — see
 * `SPONSOR_DELIVERY_UNMEASURED` below and the revenue card in
 * `monetization-overview.tsx`.
 *
 * WHY SIX REQUESTS AND NOT ONE
 * ───────────────────────────────────────────────────────────────────────────
 * There is no `/admin/sponsors/summary` endpoint; the contract in
 * `features/sponsors/types.ts` is a list, and the console must not invent a
 * route. The obvious shortcut — fetch one page and tally the rows in the
 * browser — is wrong in a way that would be invisible: `limit` is capped at
 * 100 (`apps/api/src/admin/admin-pagination.ts`), so past the hundredth
 * campaign every tile would quietly under-report while looking exactly as
 * confident. `?status=…&limit=1` asks the database to count, and reads the
 * count it returns. Six one-row requests against a table of tens of rows is a
 * fair price for a number that cannot drift.
 *
 * The status filter runs against the DERIVED status, not `sponsors.status_id`
 * (`apps/api/src/sponsors/sponsor-status.ts`): `scheduled` and `expired` are
 * computed from the campaign window at read time and are never stored. That is
 * why counting stored status keys would return zero for two of these five tiles
 * forever while appearing to have checked.
 *
 * WHAT HAPPENS WHEN THE ENDPOINT ISN'T THERE
 * ───────────────────────────────────────────────────────────────────────────
 * `GET /admin/sponsors` answers 404 until the sponsors module ships its
 * controller. That is not papered over: the query rejects, `classifyListFailure`
 * renders its 404 branch ("That list doesn't exist yet"), and no tile shows a
 * zero. A `0` next to "Live campaigns" would say "we checked, there are none".
 */

/**
 * The five values a campaign's status can display, in the console's tab order.
 *
 * DUPLICATED DELIBERATELY, and the duplication is what makes `unaccounted`
 * below possible. The runtime authority is the `sponsor_statuses` lookup table;
 * this array is only what THIS build knows how to draw a tile for. The
 * unfiltered total is fetched as its own request rather than summed from these
 * five precisely so that a sixth status added server-side surfaces as a
 * discrepancy the screen can admit to, instead of silently vanishing from a
 * total that was derived from the tiles.
 */
export const SPONSOR_CAMPAIGN_STATUSES = [
  { key: "active", label: "Live now", hint: "Inside its window and not paused" },
  { key: "scheduled", label: "Booked ahead", hint: "Start date still in the future" },
  { key: "paused", label: "Paused", hint: "Stopped by an operator" },
  { key: "expired", label: "Ended", hint: "End date has passed" },
  { key: "draft", label: "Draft", hint: "Never activated" },
] as const;

export type SponsorCampaignStatusKey = (typeof SPONSOR_CAMPAIGN_STATUSES)[number]["key"];

export type SponsorCampaignCounts = {
  /** Every campaign that is not soft-deleted. Counted by the database. */
  total: number;
  byStatus: Record<SponsorCampaignStatusKey, number>;
  /**
   * `total` minus the five tiles. Zero in every case this build has met; a
   * positive number means the API grew a status key the console cannot name,
   * and the screen says so rather than losing the rows.
   */
  unaccounted: number;
};

/**
 * Delivery figures — impressions, clicks, click-through rate.
 *
 * ALL THREE ARE PERMANENTLY `null` TODAY, and typing them as nullable numbers
 * rather than omitting them is the point: this is the shape the screen will
 * take when the figures become real, so filling it in is a change to this
 * constant and nothing else.
 *
 * They are null because NOTHING MEASURES THEM. There is no `ad_impressions` or
 * `ad_clicks` table in `apps/api/src/db/schema/` — grep it — and
 * `sponsors-schema.ts` says out loud why the counter columns were left off the
 * `sponsors` table: "a column whose only possible value is decorative is worse
 * than no column, because it looks like evidence."
 *
 * The reasoning is the dashboard's, verbatim (`features/dashboard/
 * use-dashboard-summary.ts`): a `0` next to "Impressions" reads as "nobody saw
 * it", which is a campaign-performance problem an operator would act on. The
 * truth is "we are not measuring this", which is an engineering gap they would
 * escalate. Showing 0 sends them at the wrong problem.
 */
export type SponsorDelivery = {
  impressions: number | null;
  clicks: number | null;
  /** Percentage. Derived server-side when both halves are real — never here. */
  ctr: number | null;
};

export const SPONSOR_DELIVERY_UNMEASURED: SponsorDelivery = {
  impressions: null,
  clicks: null,
  ctr: null,
};

/** Shape of the only field this hook reads off the sponsors list response. */
type SponsorListEnvelope = { pagination?: { total?: unknown } };

/**
 * Ask the database to count, and read the count.
 *
 * `limit: 1` because the rows are not wanted — only `pagination.total`, which
 * the service computes with `count(*)` over the same WHERE clause as the page
 * (`AdminSponsorsService.list`). One row is the smallest page the DTO allows.
 */
async function countCampaigns(status: string | undefined, signal: AbortSignal): Promise<number> {
  const body = await apiFetch<SponsorListEnvelope>("/admin/sponsors", {
    searchParams: { status, limit: "1" },
    signal,
  });

  const total = body?.pagination?.total;
  if (typeof total !== "number" || !Number.isFinite(total)) {
    // Trust the shape only as far as it has been checked. A response missing
    // its total is a contract mismatch, and `classifyListFailure` has a branch
    // that says so — far better than rendering NaN or coercing it to 0.
    throw new ListShapeError(
      "The sponsors endpoint answered without a pagination total, so campaigns can't be counted.",
    );
  }
  return total;
}

export function useSponsorCampaignCounts() {
  return useQuery({
    // Shares the ["admin", "sponsors"] prefix that `SPONSOR_KEYS` in
    // `features/sponsors/api.ts` invalidates, so pausing a campaign on the
    // sponsors screen refreshes these tiles too — without this file knowing
    // that screen exists.
    queryKey: ["admin", "sponsors", "status-counts"],
    queryFn: async ({ signal }): Promise<SponsorCampaignCounts> => {
      const [total, ...totals] = await Promise.all([
        countCampaigns(undefined, signal),
        ...SPONSOR_CAMPAIGN_STATUSES.map((status) => countCampaigns(status.key, signal)),
      ]);

      const byStatus = {} as Record<SponsorCampaignStatusKey, number>;
      SPONSOR_CAMPAIGN_STATUSES.forEach((status, index) => {
        byStatus[status.key] = totals[index] ?? 0;
      });

      const counted = totals.reduce((sum, value) => sum + value, 0);

      return {
        total,
        byStatus,
        // Clamped at zero: the six counts are six separate queries against a
        // live table, so a campaign created between them can make the tiles
        // sum to more than the total. A negative "unaccounted" would be a race,
        // not a missing status, and reporting it as one would be worse noise
        // than the rounding it describes.
        unaccounted: Math.max(0, total - counted),
      };
    },
    // Narrower than the app-wide default: a 403 an ops admin correctly gets,
    // and the 404 this endpoint returns until its controller ships, are both
    // final answers. Retrying them just re-asks a question already answered.
    retry: shouldRetryListError,
  });
}
