import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { db } from '../db';
import { session, user } from '../db/schema/auth-schema';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import {
  flagStatuses,
  reportCommentFlags,
  reportComments,
} from '../db/schema/comments-schema';
import { adminUsers } from '../db/schema/admin-schema';
import { effectiveStatusSql } from './report-effective-status';
import type { AdminDashboardDto } from './dto/admin-dashboard.dto';

/**
 * How far back a sign-in still counts as "active".
 *
 * 30 days is the conventional MAU window and it is DECLARED IN THE RESPONSE
 * (`basis.activeUsers.windowDays`) rather than left implicit — a number labelled
 * "Active Users" with an unstated window is a number nobody can act on.
 */
const ACTIVE_USERS_WINDOW_DAYS = 30;

/**
 * The window that makes an open report "critical".
 *
 * 15 minutes is not invented here: it is the same threshold the mobile client
 * already uses to paint a request red (`libs-mobile/lib/urgency.ts:9`,
 * `docs/design/design-system.md` §5 TONES). `reports` has no urgency or
 * priority column — urgency is derived from `expiry_at` everywhere in this
 * product — so the server-side equivalent of "critical" is deadline proximity,
 * and the payload says so.
 */
const CRITICAL_WINDOW_MINUTES = 15;

/**
 * What a counter actually measured. Same pattern as
 * AdminAnalyticsService.overview()'s `geography.basis` / `caveat`: where a
 * number's meaning is not obvious from its name, the meaning travels WITH the
 * number so the console is forced to label it honestly instead of the reader
 * guessing.
 */
export interface AdminDashboardBasis {
  activeUsers: {
    basis: 'session_created_within_window';
    windowDays: number;
    caveat: string;
  };
  criticalOpen: {
    basis: 'expiry_within_window';
    windowMinutes: number;
    caveat: string;
  };
  helpsGiven: { basis: 'mission_completions_all'; caveat: string };
  impactStories: {
    basis: 'mission_completions_on_visible_reports';
    caveat: string;
  };
  fieldUpdates: { basis: 'report_comments_visible'; caveat: string };
  commentsToday: { basis: 'report_comments_visible'; caveat: string };
  flaggedReportsPendingReview: { basis: 'no_source'; caveat: string };
}

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
   *
   * This is null PERMANENTLY, not pending — hence its `basis` entry says
   * `no_source` rather than describing a query.
   */
  flaggedReportsPendingReview: null;

  /** Distinct citizens who signed in within `basis.activeUsers.windowDays`. */
  activeUsers: number;
  /** Open reports expiring within `basis.criticalOpen.windowMinutes`. */
  criticalOpen: number;
  /** Every mission completion ever filed. */
  helpsGiven: number;
  /** Community Updates (= `report_comments`, ADR 0013), all time. */
  fieldUpdates: number;
  /** Community Updates posted today, in `timeZone`. */
  commentsToday: number;
  /** An impact story IS a completion — see `basis.impactStories`. */
  impactStories: number;

  basis: AdminDashboardBasis;
  timeZone: string;
  generatedAt: string;
}

@Injectable()
export class AdminDashboardService {
  /**
   * The Dashboard tab's counters.
   *
   * Every number here is a real query against real tables. Where the design
   * shows a number this schema cannot produce, this returns null rather than a
   * plausible-looking zero — the whole reason this backend exists is that the
   * prototype's dashboard was mock data all the way down. And where a number IS
   * computable but only under a definition somebody had to choose, the choice
   * ships in `basis` next to the number rather than living in this comment.
   */
  async counters(query: AdminDashboardDto): Promise<AdminDashboardCounters> {
    const { timeZone } = query;

    // `col AT TIME ZONE $tz` converts a timestamptz to local wall-clock time in
    // that zone; ::date then truncates to the calendar day *there*. Comparing
    // against now() through the same conversion is what makes "today" mean the
    // reader's today, not UTC's.
    //
    // ONE notion of "today" for the whole payload: todaysReports,
    // completedToday and commentsToday all go through this, so no two tiles can
    // ever disagree about where the day boundary is.
    const isToday = (column: unknown) =>
      sql`(${column} AT TIME ZONE ${timeZone})::date = (now() AT TIME ZONE ${timeZone})::date`;

    // Computed in JS and bound as a parameter rather than written as
    // `now() - interval`: `session.created_at` is `timestamp` WITHOUT time zone
    // (Better Auth owns that column), and comparing it to `now()` would make
    // Postgres cast the timestamptz using the *database session's* TimeZone
    // setting — a silent dependency on server configuration. Drizzle binds a
    // Date to a non-tz column as its UTC wall clock, which is exactly how
    // Better Auth wrote it, so both sides of this comparison are UTC. Same
    // approach AdminAnalyticsService uses for `user.created_at`.
    const activeSince = new Date(
      Date.now() - ACTIVE_USERS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    // Staff are excluded from every "community" figure, the same way and for
    // the same reason totalUsers excludes them: seeding two console logins must
    // not inflate the community's size — or its activity — by two forever.
    const notStaff = (column: unknown) =>
      notExists(
        db
          .select({ one: sql`1` })
          .from(adminUsers)
          .where(sql`${adminUsers.userId} = ${column}`),
      );

    const [
      totalUsersRow,
      todaysReportsRow,
      activeMissionsRow,
      completionsRow,
      flaggedCommentsRow,
      activeUsersRow,
      criticalOpenRow,
      impactStoriesRow,
      commentsRow,
    ] = await Promise.all([
      // "Total Platform Users" = citizens. Staff accounts are excluded, so
      // seeding two admin logins doesn't silently inflate the community's size
      // by two forever.
      db
        .select({ count: sql<string>`count(*)` })
        .from(user)
        .where(notStaff(user.id)),

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

      // completedToday and helpsGiven come out of ONE query so they cannot
      // drift: helpsGiven is exactly completedToday without the date filter.
      // Two separate queries with two separate WHERE clauses is how a console
      // ends up showing "3 completed today" above "2 helps given".
      //
      // Keyed on submittedAt — the moment the volunteer finished and filed the
      // completion. verifiedAt is set in the same request today
      // (MissionsService), so the two agree; submittedAt is the one that stays
      // meaningful if verification ever becomes asynchronous, which
      // mission-completion.md BR-4 explicitly leaves room for.
      db
        .select({
          total: sql<string>`count(*)`,
          today: sql<string>`count(*) filter (where ${isToday(missionCompletions.submittedAt)})`,
        })
        .from(missionCompletions),

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

      // Distinct citizens with a session created inside the window. `distinct`
      // matters: Better Auth writes one row per sign-in, so a user with three
      // devices would otherwise count three times.
      db
        .select({ count: sql<string>`count(distinct ${session.userId})` })
        .from(session)
        .where(
          and(gte(session.createdAt, activeSince), notStaff(session.userId)),
        ),

      // Open, not deleted, and inside the critical window. effectiveStatusSql
      // rather than a hand-rolled status test, because report-effective-status.ts
      // is the single authority on what "open" means for an admin surface —
      // `status_id` alone would count 44 long-dead reports as live.
      db
        .select({ count: sql<string>`count(*)` })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .where(
          and(
            sql`${effectiveStatusSql} = 'open'`,
            sql`${reports.expiryAt} <= now() + make_interval(mins => ${CRITICAL_WINDOW_MINUTES})`,
          ),
        ),

      // Filtered to completions whose report is still visible, so this agrees
      // with the Impact Stories list (AdminImpactStoriesService.list() filters
      // isNull(reports.deletedAt)). A tile that counts stories the linked page
      // cannot show is a tile that generates a support ticket.
      db
        .select({ count: sql<string>`count(*)` })
        .from(missionCompletions)
        .innerJoin(missions, eq(missionCompletions.missionId, missions.id))
        .innerJoin(reports, eq(missions.reportId, reports.id))
        .where(isNull(reports.deletedAt)),

      // Community Updates = report_comments (ADR 0013). Moderator-removed
      // comments and comments on soft-deleted reports are both excluded: a
      // removed comment is gone from the public thread exactly as a hard delete
      // would have made it, so counting it as community activity would credit
      // the platform for content it took down.
      db
        .select({
          total: sql<string>`count(*)`,
          today: sql<string>`count(*) filter (where ${isToday(reportComments.createdAt)})`,
        })
        .from(reportComments)
        .innerJoin(reports, eq(reportComments.reportId, reports.id))
        .where(
          and(isNull(reportComments.deletedAt), isNull(reports.deletedAt)),
        ),
    ]);

    return {
      totalUsers: Number(totalUsersRow[0]?.count ?? 0),
      todaysReports: Number(todaysReportsRow[0]?.count ?? 0),
      activeMissions: Number(activeMissionsRow[0]?.count ?? 0),
      completedToday: Number(completionsRow[0]?.today ?? 0),
      flaggedCommentsPendingReview: Number(flaggedCommentsRow[0]?.count ?? 0),
      flaggedReportsPendingReview: null,

      activeUsers: Number(activeUsersRow[0]?.count ?? 0),
      criticalOpen: Number(criticalOpenRow[0]?.count ?? 0),
      helpsGiven: Number(completionsRow[0]?.total ?? 0),
      fieldUpdates: Number(commentsRow[0]?.total ?? 0),
      commentsToday: Number(commentsRow[0]?.today ?? 0),
      impactStories: Number(impactStoriesRow[0]?.count ?? 0),

      basis: {
        activeUsers: {
          basis: 'session_created_within_window',
          windowDays: ACTIVE_USERS_WINDOW_DAYS,
          caveat:
            `Distinct non-staff users who SIGNED IN in the last ${ACTIVE_USERS_WINDOW_DAYS} days ` +
            '(a `session` row was created). Not the same as "used the app": Better Auth slides an ' +
            "existing session's expiry instead of writing a new row, so a daily user whose session " +
            'predates the window is not counted here. There is no per-request activity table to ' +
            'count instead.',
        },
        criticalOpen: {
          basis: 'expiry_within_window',
          windowMinutes: CRITICAL_WINDOW_MINUTES,
          caveat:
            '`reports` has NO urgency or priority column — urgency is derived from `expiry_at` ' +
            `everywhere in this product. "Critical" here means an open, non-deleted report whose ` +
            `expiry_at falls within the next ${CRITICAL_WINDOW_MINUTES} minutes, which is the ` +
            'same threshold the mobile client uses to paint a request red. It measures deadline ' +
            'proximity, not severity: a Medical Help request with six hours left is not counted.',
        },
        helpsGiven: {
          basis: 'mission_completions_all',
          caveat:
            'Every completion ever filed — the same basis as completedToday, without the date ' +
            'filter. Unlike impactStories it is NOT filtered by report visibility, so a completion ' +
            'whose report was later removed still counts: the help still happened.',
        },
        impactStories: {
          basis: 'mission_completions_on_visible_reports',
          caveat:
            'An impact story IS a completion (docs/features/impact-story.md BR-1) — there is no ' +
            'separate stories table. Counted only where the report is not soft-deleted, so this ' +
            'matches the Impact Stories list. It differs from helpsGiven only when a completed ' +
            'report was later removed.',
        },
        fieldUpdates: {
          basis: 'report_comments_visible',
          caveat:
            'Community Updates are `report_comments` (ADR 0013) — the per-report public feed, not ' +
            'Announcements. Moderator-removed comments and comments on soft-deleted reports are ' +
            'excluded, matching what a citizen can actually see.',
        },
        commentsToday: {
          basis: 'report_comments_visible',
          caveat:
            `The same rows as fieldUpdates, narrowed to today in ${timeZone} — the one notion of ` +
            '"today" this payload has.',
        },
        flaggedReportsPendingReview: {
          basis: 'no_source',
          caveat:
            'Permanently null, not pending. Only comments can be flagged in this product; there ' +
            'is no flagged-reports table to count.',
        },
      },

      timeZone,
      generatedAt: new Date().toISOString(),
    };
  }
}
