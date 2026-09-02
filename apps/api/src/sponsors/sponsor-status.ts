import { sql } from 'drizzle-orm';
import { sponsorStatuses, sponsors } from '../db/schema/sponsors-schema';
import type { SponsorStatusKey } from '../db/schema/sponsors-schema';

/**
 * ==========================================================================
 * `sponsors.status_id` holds the OPERATOR'S INTENT — draft, active or paused.
 * `scheduled` and `expired` are derived from the campaign window at read time
 * and are never written. Every surface that shows, filters or gates on a
 * sponsor's status MUST go through this file.
 * ==========================================================================
 *
 * THE PROBLEM THIS SOLVES, quoted rather than invented.
 * docs/webadmin/08-monetization.md §4 lists two of the prototype's failures as
 * facts about the mobile app, not opinions:
 *
 *     Campaign startDate / endDate  ->  "Mobile has no scheduling"
 *                                       ❌ Campaigns can't start or expire
 *     status: Active / Paused       ->  "Mobile always renders its sponsors"
 *                                       ❌ Pausing changes nothing
 *
 * and §5 gap #6 adds the console half: "the filter tabs include 'scheduled' and
 * 'expired' states that can't be reached automatically. Campaigns must be paused
 * by hand. Fix: derive status from dates."
 *
 * THE DECISION: derive. `scheduled` and `expired` are computed from
 * `start_date` / `end_date` at read time and never stored. Three reasons, in
 * order of weight:
 *
 *  1. Deriving is exact. A cron that flips `active -> expired` at midnight is
 *     correct only between runs, and the window between "the campaign ended"
 *     and "the job noticed" is a window in which an expired advertisement is
 *     still being shown to citizens. A sponsor is a commercial commitment with
 *     an end date somebody signed; running it 40 minutes long because a worker
 *     was backed up is a real problem, not a cosmetic one. `end_date <= now()`
 *     has no window.
 *  2. Storing it would need a reverse job too. A campaign scheduled for the
 *     first of the month would have to be flipped back `scheduled -> active`,
 *     so the "nothing has to run on time" property is lost in both directions.
 *     updates-schema.ts made exactly this call for `community_updates.publish_at`
 *     and missions-schema.ts made it for the 15-minute volunteer deadline
 *     ("checked lazily — never a scheduled job"). This is the same shape of
 *     fact for the third time.
 *  3. It keeps `status_id` meaning one thing: what a human decided. "Who paused
 *     this campaign" stays answerable, because nothing but a human ever writes
 *     that column — which is also what makes the `sponsor.pause` audit row
 *     trustworthy.
 *
 * THE INVARIANT THAT TIES THE TWO SURFACES TOGETHER, and the reason both live
 * in one file rather than one each:
 *
 *     A sponsor is on a citizen's screen  ⟺  deleted_at IS NULL
 *                                             AND its effective status is 'active'.
 *
 * `sponsorIsLiveSql` and `effectiveSponsorStatusSql` are two readings of that
 * single sentence. Split across two modules they would drift, and the drift
 * would be invisible: the console would say "Active" while the app showed
 * nothing, or the reverse. sponsors.service.spec.ts asserts the equivalence
 * directly.
 *
 * THE COST, stated plainly: `scheduled` and `expired` are not indexable as a
 * plain equality, so an admin filter on either cannot use
 * `sponsors_status_window_idx`. At this table's size — a sponsor list is tens
 * of rows, not millions — that is irrelevant. The citizen read, which is the
 * hot one, is a plain equality on the stored key plus two range predicates and
 * uses the index as written.
 */

/** The five values a surface can display. Never more than three are stored. */
export const SPONSOR_EFFECTIVE_STATUSES = [
  'active',
  'scheduled',
  'paused',
  'expired',
  'draft',
] as const;

export type SponsorEffectiveStatus = SponsorStatusKey;

/**
 * SQL for the derived status. Requires `sponsor_statuses` to be joined.
 *
 * Order matters and is deliberate:
 *
 *   not active  passes straight through. A paused campaign whose end date has
 *               since gone by is PAUSED, not expired — somebody stopped it, and
 *               relabelling that as a campaign that merely ran its course
 *               erases the decision. Same for a draft with dates typed in.
 *   expired     before scheduled, so a window that is somehow both past and
 *               future (start > end, which the DTO rejects) resolves to the
 *               terminal state rather than promising a campaign that will
 *               never run.
 *   otherwise   active.
 *
 * `now()` is the DATABASE's clock in every predicate here, as it is in the
 * citizen query below. Comparing a JS `new Date()` against timestamps Postgres
 * wrote would let a few seconds of container drift start a campaign early or
 * show an ended one.
 */
export const effectiveSponsorStatusSql = sql<SponsorEffectiveStatus>`
  case
    when ${sponsorStatuses.key} <> 'active' then ${sponsorStatuses.key}
    when ${sponsors.endDate} is not null and ${sponsors.endDate} <= now() then 'expired'
    when ${sponsors.startDate} is not null and ${sponsors.startDate} > now() then 'scheduled'
    else 'active'
  end
`;

/**
 * The same rule in TypeScript, for a row already fetched.
 *
 * Two implementations of one rule is a drift risk, so the specs assert they
 * agree on every combination. Keeping both is still worth it: the SQL is what
 * makes filtering and counting correct inside the database, and this is what
 * keeps a single row's projection correct without a second round trip after a
 * write.
 */
export function effectiveSponsorStatusOf(
  row: {
    storedStatusKey: string;
    startDate: Date | null;
    endDate: Date | null;
  },
  now: number = Date.now(),
): SponsorEffectiveStatus {
  if (row.storedStatusKey !== 'active') {
    return row.storedStatusKey as SponsorEffectiveStatus;
  }
  if (row.endDate !== null && row.endDate.getTime() <= now) return 'expired';
  if (row.startDate !== null && row.startDate.getTime() > now) {
    return 'scheduled';
  }
  return 'active';
}

/**
 * The citizen visibility predicate: everything that must be true for a sponsor
 * to be rendered in the app. Requires `sponsor_statuses` to be joined.
 *
 * This is the OTHER half of the invariant in the header — it is
 * `effectiveSponsorStatusSql = 'active'` plus the soft-delete filter, written
 * as a set of plain predicates so the query planner can use
 * `sponsors_status_window_idx` instead of evaluating a CASE per row.
 *
 * The null handling is the load-bearing part, and the two nulls are not
 * symmetrical in meaning even though they are in code:
 *
 *   start_date NULL -> live now. A campaign activated with no start date must
 *                      not be invisible for want of a schedule nobody needed.
 *   end_date   NULL -> runs until paused.
 *
 * Note `>` and not `>=` on the end date: a campaign whose end is this exact
 * instant has ended. The boundary is stated once here and mirrored exactly by
 * `<=` in the `expired` branch above; flipping one without the other is how the
 * console and the app would come to disagree for one second a campaign.
 */
export const sponsorIsLiveSql = sql`
  ${sponsorStatuses.key} = 'active'
  and ${sponsors.deletedAt} is null
  and (${sponsors.startDate} is null or ${sponsors.startDate} <= now())
  and (${sponsors.endDate} is null or ${sponsors.endDate} > now())
`;
