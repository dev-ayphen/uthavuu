import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { flagStatuses, reportCommentFlags } from '../db/schema/comments-schema';
import { adminUsers } from '../db/schema/admin-schema';
import type { AdminDashboardDto } from './dto/admin-dashboard.dto';

export interface AdminDashboardCounters {
  totalUsers: number;
  todaysReports: number;
  activeMissions: number;
  completedToday: number;
  flaggedCommentsPendingReview: number;
  /**
   * Always null. The console's design has a "Fake Reports" tile
   * (docs/webadmin/03-dashboard-and-users.md §0.1), but nothing in this codebase
   * flags a *report* — `report_comment_flags` flags comments, and that is the
   * only flagging that exists (see the note at the top of
   * db/schema/comments-schema.ts).
   *
   * Null, not 0, and not omitted. 0 would be a fabricated fact — the console
   * would render "0 fake reports" as though the check had run and found none.
   * Omitting it would read to the client as a bug. Null says "there is no
   * source for this number", which is the truth, and gives the console
   * something explicit to render an em dash for.
   */
  flaggedReportsPendingReview: null;
  timeZone: string;
  generatedAt: string;
}

@Injectable()
export class AdminDashboardService {
  /**
   * The five headline counters on the console's Dashboard tab.
   *
   * Every number here is a real query against real tables. Where the design
   * shows a number this schema cannot produce, this returns null rather than a
   * plausible-looking zero — the whole reason this backend exists is that the
   * prototype's dashboard was mock data all the way down.
   */
  async counters(query: AdminDashboardDto): Promise<AdminDashboardCounters> {
    const { timeZone } = query;

    // `col AT TIME ZONE $tz` converts a timestamptz to local wall-clock time in
    // that zone; ::date then truncates to the calendar day *there*. Comparing
    // against now() through the same conversion is what makes "today" mean the
    // reader's today, not UTC's.
    const isToday = (column: unknown) =>
      sql`(${column} AT TIME ZONE ${timeZone})::date = (now() AT TIME ZONE ${timeZone})::date`;

    const [
      totalUsersRow,
      todaysReportsRow,
      activeMissionsRow,
      completedTodayRow,
      flaggedCommentsRow,
    ] = await Promise.all([
      // "Total Platform Users" = citizens. Staff accounts are excluded, so
      // seeding two admin logins doesn't silently inflate the community's size
      // by two forever.
      db
        .select({ count: sql<string>`count(*)` })
        .from(user)
        .where(
          notExists(
            db
              .select({ one: sql`1` })
              .from(adminUsers)
              .where(eq(adminUsers.userId, user.id)),
          ),
        ),

      // Soft-deleted reports are excluded, matching every citizen-facing listing
      // in ReportsService.
      db
        .select({ count: sql<string>`count(*)` })
        .from(reports)
        .where(and(isNull(reports.deletedAt), isToday(reports.createdAt))),

      // A mission counts as active once at least one volunteer has *confirmed*
      // (status 'active'), on a report that is still open and not deleted.
      // Volunteers still inside the 15-minute confirmation window ('joined')
      // do not count — nobody is helping yet. This is the same definition
      // ReportsService.communityStats() already uses for "active volunteers",
      // collapsed from volunteers to distinct missions.
      db
        .select({ count: sql<string>`count(distinct ${missions.id})` })
        .from(missions)
        .innerJoin(
          missionVolunteers,
          eq(missionVolunteers.missionId, missions.id),
        )
        .innerJoin(
          missionVolunteerStatuses,
          eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
        )
        .innerJoin(reports, eq(missions.reportId, reports.id))
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .where(
          and(
            eq(missionVolunteerStatuses.key, 'active'),
            eq(reportStatuses.key, 'open'),
            isNull(reports.deletedAt),
          ),
        ),

      // Keyed on submittedAt — the moment the volunteer finished and filed the
      // completion. verifiedAt is set in the same request today
      // (MissionsService), so the two agree; submittedAt is the one that stays
      // meaningful if verification ever becomes asynchronous, which
      // mission-completion.md BR-4 explicitly leaves room for.
      db
        .select({ count: sql<string>`count(*)` })
        .from(missionCompletions)
        .where(isToday(missionCompletions.submittedAt)),

      // Everything an admin has not yet dealt with: 'submitted' (untouched) and
      // 'under_review' (opened, not resolved). 'action_taken' and 'dismissed'
      // are closed.
      db
        .select({ count: sql<string>`count(*)` })
        .from(reportCommentFlags)
        .innerJoin(
          flagStatuses,
          eq(reportCommentFlags.statusId, flagStatuses.id),
        )
        .where(inArray(flagStatuses.key, ['submitted', 'under_review'])),
    ]);

    return {
      totalUsers: Number(totalUsersRow[0]?.count ?? 0),
      todaysReports: Number(todaysReportsRow[0]?.count ?? 0),
      activeMissions: Number(activeMissionsRow[0]?.count ?? 0),
      completedToday: Number(completedTodayRow[0]?.count ?? 0),
      flaggedCommentsPendingReview: Number(flaggedCommentsRow[0]?.count ?? 0),
      flaggedReportsPendingReview: null,
      timeZone,
      generatedAt: new Date().toISOString(),
    };
  }
}
