import { NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { reportStatuses, reports } from '../db/schema/reports-schema';

type ReportRow = typeof reports.$inferSelect;

/**
 * `reports.deleted_at IS NULL` — the predicate every citizen-facing query over
 * `reports` must carry.
 *
 * docs/architecture/data.md invariant 1 states the rule; this constant exists so
 * a new listing can satisfy it by importing something rather than by remembering
 * something. `ReportsService` got it right on all seven of its own queries and
 * every other service got it wrong on all of theirs — which is what an invariant
 * enforced by discipline alone always looks like eventually.
 *
 * Admin paths deliberately do NOT use this: `AdminReportsService` reaches hidden
 * rows via `?includeDeleted=true`, and its "reinstate" flow could not exist if it
 * could not see them. That exception is audited and intentional.
 */
export const removedFilter = isNull(reports.deletedAt);

/**
 * Report statuses that exist BEFORE a report is published, and therefore must
 * never appear on a citizen surface.
 *
 * `pending_review` — a photo needs a moderator; the report is real and the
 *                    reporter can see it in their own list, but nobody else may.
 * `rejected`       — moderation refused it. It stays for the reporter's own
 *                    history and never becomes public.
 */
export const PRE_PUBLICATION_STATUS_KEYS = [
  'pending_review',
  'rejected',
] as const;

/**
 * `status_id` is not one of the pre-publication statuses.
 *
 * Written as a subquery against the lookup table rather than a joined
 * comparison, deliberately: several citizen queries do not join
 * `report_statuses` at all, and a predicate that silently required a join would
 * be a predicate people quietly drop. `report_statuses` has six rows, so the
 * planner turns this into a trivial hashed subplan.
 */
export const notPrePublication = sql`${reports.statusId} not in (
  select id from report_statuses where key in ('pending_review', 'rejected')
)`;

/**
 * The predicate every citizen-facing query over `reports` must carry.
 *
 * docs/architecture/data.md invariant 1 states the soft-delete half; this
 * constant exists so a new listing can satisfy the whole rule by importing
 * something rather than by remembering two things.
 *
 * ⚠️ THE PRE-PUBLICATION HALF WAS ADDED HERE, NOT AS A SECOND EXPORT, ON
 * PURPOSE. The soft-delete invariant was already enforced by discipline alone
 * and the end-to-end audit found it leaking on six separate mobile read paths —
 * `ReportsService` had it right on all seven of its own queries and every other
 * service had it wrong on all of theirs. Publishing a second predicate that
 * callers must ALSO remember would reproduce that failure exactly, and the
 * consequence this time is a report held for moderation appearing in the public
 * feed, which defeats the entire verification feature. Widening the predicate
 * every existing caller already imports means they were all fixed the moment
 * this line changed.
 *
 * Admin paths deliberately do NOT use this: `AdminReportsService` reaches hidden
 * rows via `?includeDeleted=true`, and its "reinstate" flow could not exist if it
 * could not see them. That exception is audited and intentional. The photo
 * review queue relies on the same exemption to show a moderator the very reports
 * this predicate hides from citizens.
 */
export const notRemoved = and(removedFilter, notPrePublication)!;

/**
 * A 404 that says *why*, for a report that no longer exists for citizens.
 *
 * WHY THIS IS ITS OWN CODE, AND WHY IT IS HONEST RATHER THAN SILENT.
 *
 * Hiding is the product's highest-stakes moderation action, used when content is
 * abusive, fraudulent, or endangering someone. It is reached with a real person
 * mid-flow: a volunteer travelling to a location, with the mission open on their
 * phone. Three behaviours were on the table for them:
 *
 *  1. Keep serving the report. Rejected outright — it leaks the title, landmark
 *     and **latitude/longitude** of a report an admin deliberately removed. That
 *     is the leak this whole change exists to close.
 *  2. Vanish it with a bare "Report not found". Safe, but it is the silent
 *     moderation the end-to-end audit keeps flagging: indistinguishable from a
 *     bad link or a bug, so the volunteer retries, or assumes the app broke.
 *  3. Vanish the *content* and name the *reason*. Chosen.
 *
 * So: a hidden report is **absent from every listing** (it does not linger as a
 * tombstone card — that would need a coordinated mobile change and new English +
 * Tamil copy, see the reporting notes), and **any direct access to it returns
 * this** — a 404 whose code says the request was removed, not merely missing.
 *
 * The status stays 404, identical to a report id that never existed, so nothing
 * new is enumerable at the status-code level. The body does distinguish "removed"
 * from "never existed" for a caller holding a valid id. That is a deliberate and
 * cheap trade: it tells a participant — who already knows first-hand that the
 * report existed — what happened to it, while telling a stranger nothing about
 * why, by whom, or what it said.
 *
 * Distinct from admin's `REPORT_HIDDEN` (409), which means "reinstate this report
 * before you can change its status" and is about an admin's own next action.
 *
 * THE WORDING NAMES NO ACTOR, ON PURPOSE. `deleted_at` is set by three different
 * actors: an admin hiding the report, the reporter using Delete Report
 * (`ReportsService.delete`), and account deletion soft-deleting the reporter's
 * un-volunteered reports (`UsersService.deleteAccount`). "Removed by a moderator"
 * would be a false accusation in two of the three, and the column cannot tell
 * them apart afterwards — `deleted_by` is `SET NULL`, so a self-deleted report
 * whose owner then deleted their account is indistinguishable from an admin hide.
 * "Has been removed" is true in all three and claims nothing it cannot support.
 */
export class ReportRemovedException extends NotFoundException {
  constructor() {
    super({
      code: 'REPORT_REMOVED',
      message: 'This request has been removed and is no longer available.',
    });
  }
}

/**
 * Loads a report only if a citizen may see it.
 *
 * Deliberately one unfiltered query plus a branch, rather than a filtered query
 * that cannot tell the two failures apart: distinguishing "never existed" from
 * "was removed" is the entire point of the honest state above.
 *
 * Use this on **writes** as well as reads. A moderation action that only stops
 * reading is not a moderation action — before this existed, a citizen could post
 * a new public Community Comment onto a report an admin had already hidden.
 */
export async function requireVisibleReport(
  reportId: string,
): Promise<ReportRow> {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report || report.deletedAt !== null)
    await throwForMissingReport(reportId, report);
  // A report still awaiting photo moderation is not yet public, so every
  // citizen path that guards a read or a write with this must refuse it —
  // including the writes. Without this branch a stranger holding the id could
  // post a public Community Comment onto a report no moderator had cleared,
  // which is the same class of bug ReportRemovedException was written for.
  //
  // NOT `ReportRemovedException`, which is what this threw first. Its message is
  // "This request has been removed and is no longer available" — and that is
  // simply FALSE about a report awaiting moderation. It has not been removed; it
  // has not been published yet. The reporter can still open it, edit it and send
  // a replacement photo, and telling them their own live request was removed
  // would be a worse lie than saying nothing.
  //
  // `REPORT_NOT_FOUND` discloses nothing a stranger could not already infer from
  // a 404, and is the honest answer on this guard, which does not know WHO is
  // asking — `findOne` is the path that knows, and it lets the owner through.
  if (await isPrePublication(report.statusId)) {
    throw new NotFoundException({
      code: 'REPORT_NOT_FOUND',
      message: 'Report not found',
    });
  }
  return report;
}

/** True when this status_id is one of the pre-publication keys. */
async function isPrePublication(statusId: string): Promise<boolean> {
  const [row] = await db
    .select({ key: reportStatuses.key })
    .from(reportStatuses)
    .where(eq(reportStatuses.id, statusId));
  return (
    row !== undefined &&
    (PRE_PUBLICATION_STATUS_KEYS as readonly string[]).includes(row.key)
  );
}

/**
 * The same branch, for a caller whose own query already applied `notRemoved`
 * and came back empty — it knows the report is unservable but not why.
 *
 * Returns `never`, so `if (!row) await throwForMissingReport(id)` type-narrows
 * without a redundant `throw` the reader has to reason about.
 */
export async function throwForMissingReport(
  reportId: string,
  known?: ReportRow,
): Promise<never> {
  const report =
    known ??
    (await db.select().from(reports).where(eq(reports.id, reportId)))[0];
  if (report && report.deletedAt !== null) throw new ReportRemovedException();
  throw new NotFoundException({
    code: 'REPORT_NOT_FOUND',
    message: 'Report not found',
  });
}
