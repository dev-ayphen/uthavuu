import { sql } from 'drizzle-orm';
import { reportStatuses, reports } from '../db/schema/reports-schema';

/**
 * ==========================================================================
 * `reports.status_id` is not trustworthy on its own. Every admin surface that
 * shows or filters a report's status MUST go through this file.
 * ==========================================================================
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

/** The five values an admin surface can see. */
export const EFFECTIVE_STATUSES = [
  'open',
  'expired',
  'closed',
  'completed',
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
    when ${reportStatuses.key} = 'open' and ${reports.expiryAt} < now() then 'expired'
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
  if (row.storedStatusKey === 'open' && row.expiryAt.getTime() < Date.now()) {
    return 'expired';
  }
  return row.storedStatusKey as EffectiveStatus;
}
