import { NotFoundException } from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { reports } from '../db/schema/reports-schema';

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
export const notRemoved = isNull(reports.deletedAt);

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
  return report;
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
