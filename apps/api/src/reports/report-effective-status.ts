import { and, eq, isNull, sql } from 'drizzle-orm';
import { reportStatuses, reports } from '../db/schema/reports-schema';

/**
 * ==========================================================================
 * `reports.status_id` is not trustworthy on its own. EVERY surface that shows,
 * filters or acts on a report's status MUST go through this file — the admin
 * console, the citizen API, and every mutation that asks "is this still open?".
 * ==========================================================================
 *
 * This lived in `admin/` and was used only by the console, which is how the
 * citizen API spent months disagreeing with it: Discover filtered on
 * `status_id = open` with no expiry term, so it listed reports the console
 * called expired, counted them as urgent (the "expiring within the hour" test
 * is `expiry_at - now() < 1 hour`, which is TRUE for every already-expired
 * report because the interval is negative), and `accept()` let a volunteer join
 * one — which unlocks the reporter's phone number. Same database, two answers.
 *
 * THE PROBLEM, measured rather than assumed. `report_statuses` seeds four keys
 * — open / closed / expired / completed (db/seed.ts) — and **nothing in this
 * codebase ever writes 'expired'**. A report is created 'open'
 * (ReportsService.create()), moves to 'closed' only when its reporter cancels
 * it (ReportsService.close()), and to 'completed' on mission completion. There
 * is no cron, no lazy sweep, and no write path of any kind that consults
 * `expiry_at` and updates `status_id`. Verified against the dev database on
 * 2026-08-28:
 *
 *     status    | total | past_expiry
 *     ----------+-------+-------------
 *     completed |    23 |          23
 *     open      |    44 |          44        <-- every single one
 *
 * Forty-four reports carry status 'open'. All forty-four are already past their
 * `expiry_at`. Zero rows anywhere carry status 'expired'. An admin table that
 * renders `status_id` would show 44 live requests where there are none, and a
 * "show me expired reports" filter keyed on `status_id` would return an empty
 * list forever while claiming to have checked.
 *
 * THE DECISION: derive expiry at read time from `expiry_at`. Do not write the
 * 'expired' status. Three reasons, in order of weight:
 *
 *  1. A backfill or a cron that rewrites `status_id` changes what the MOBILE app
 *     shows. `ReportsService.listMine()` returns every status to the reporter,
 *     and the Discover feed filters on `status = 'open'` — so writing 'expired'
 *     would silently empty citizens' feeds and relabel their own reports. That
 *     is a product change to the citizen surface, and it is not the admin
 *     console's to make unilaterally.
 *  2. Deriving is exact. A scheduled job is correct only between runs; the
 *     window between "expired" and "marked expired" is a window in which the
 *     admin console is wrong. `expiry_at < now()` has no window.
 *  3. This codebase already made this call once, for the same reason. A
 *     volunteer's 15-minute confirmation deadline is "checked lazily — never a
 *     scheduled job" (missions-schema.ts). Expiry is the same shape of fact.
 *
 * The cost, stated plainly: `expired` is not indexable as a plain equality, and
 * the derived expression cannot use `reports_status_id_idx`. At this table's
 * size that is irrelevant; if `reports` grows into the millions, the fix is a
 * partial or expression index on `(expiry_at) WHERE status_id = <open>`, not a
 * status backfill.
 *
 * If the product later decides the stored status SHOULD be written, this file is
 * the specification for what to write — and the admin API keeps working either
 * way, because it never trusted the column in the first place.
 */

/**
 * Every value an admin surface can see.
 *
 * `pending_review` and `rejected` joined this list with photo verification and
 * are FIRST-CLASS, not special cases bolted on at the edges. They are stored
 * keys like `closed` and `completed`, so the `else` branch of the SQL below
 * already returns them — but the union, the admin status filter (which derives
 * its enum from this constant), the badges and the per-status counts all read
 * from here, and leaving them out would have produced a status the console
 * could receive and could not name.
 */
export const EFFECTIVE_STATUSES = [
  'open',
  'pending_review',
  'expired',
  'closed',
  'completed',
  'rejected',
  'deleted',
] as const;

export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

/**
 * SQL for the derived status. Requires `report_statuses` to be joined.
 *
 * Order matters and is deliberate:
 *
 *   deleted   wins over everything — a soft-deleted report is not "an expired
 *             report", it is removed, and admin filters need to reach it as
 *             exactly one thing.
 *   expired   applies ONLY to a stored 'open'. A completed report whose
 *             expiry_at has passed is completed — the help arrived. Collapsing
 *             those two would report 23 of this database's completions as
 *             expired, which is the opposite of the truth.
 *   otherwise the stored key, which is accurate for closed and completed.
 */
export const effectiveStatusSql = sql<EffectiveStatus>`
  case
    when ${reports.deletedAt} is not null then 'deleted'
    when ${reportStatuses.key} = 'open' and ${reports.expiryAt} <= now() then 'expired'
    else ${reportStatuses.key}
  end
`;

/**
 * The same rule in TypeScript, for rows already fetched.
 *
 * Two implementations of one rule is a drift risk, so the spec asserts they
 * agree on every combination (report-effective-status.spec.ts). Keeping both is
 * still worth it: the SQL is what makes filtering and counting correct in the
 * database, and this is what keeps a single fetched row's projection correct
 * without a second round trip.
 */
export function effectiveStatusOf(row: {
  storedStatusKey: string;
  expiryAt: Date;
  deletedAt: Date | null;
}): EffectiveStatus {
  if (row.deletedAt !== null) return 'deleted';
  if (row.storedStatusKey === 'open' && row.expiryAt.getTime() <= Date.now()) {
    return 'expired';
  }
  return row.storedStatusKey as EffectiveStatus;
}

/**
 * The citizen predicate: everything that must be true for a report to still be
 * ACTIONABLE — listable in Discover, countable as active, acceptable by a new
 * volunteer. Requires `report_statuses` to be joined.
 *
 * It is the exact complement of the `expired` branch above, and it is written
 * here rather than inline at each call site for the reason this file exists:
 * `status = 'open'` alone is not "open", and every place that believed it was
 * got the same class of bug.
 *
 * `>` here against `<=` above, so the two partition the timeline with no
 * instant belonging to both and none to neither.
 *
 * ⚠️ THIS IS NOT AN ACCESS CHECK FOR WORK ALREADY IN FLIGHT. Expiry stops a
 * report attracting NEW commitments; it does not cancel a mission somebody
 * already accepted. A volunteer who accepted at 10:30 on a report expiring at
 * 12:00 keeps their roster row, their Mission Chat and the reporter's phone
 * number after 12:00 — the help is happening, and the clock running out on the
 * request does not un-happen it. `hasActiveAccess()` in missions.service.ts is
 * deliberately NOT expressed in terms of this predicate; do not "fix" that.
 */
export const isActionableSql = and(
  eq(reportStatuses.key, 'open'),
  isNull(reports.deletedAt),
  sql`${reports.expiryAt} > now()`,
);

/**
 * The same predicate for a report row fetched WITHOUT joining
 * `report_statuses` — the shape every mutation guard already has in hand.
 *
 * Returns the reason it is not actionable, or null when it is, so a caller can
 * raise the message that fits rather than a generic refusal.
 */
export function notActionableReason(row: {
  storedStatusKey: string;
  expiryAt: Date;
  deletedAt: Date | null;
}): 'deleted' | 'expired' | 'not-open' | null {
  const status = effectiveStatusOf(row);
  if (status === 'open') return null;
  if (status === 'deleted') return 'deleted';
  if (status === 'expired') return 'expired';
  return 'not-open';
}
