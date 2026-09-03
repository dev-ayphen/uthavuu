import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { adminUsers } from '../db/schema/admin-schema';
import { effectiveStatusSql } from './report-effective-status';
import type { AnalyticsDto } from './dto/analytics.dto';

/**
 * Analytics — aggregates over tables that already exist. Read-only, no new
 * schema, and `analytics:view` gated, which makes it the one section super
 * admins can reach and ops admins cannot.
 *
 * Every number is a real query. Where the schema cannot answer a question the
 * design asks, the response says so in words rather than returning a plausible
 * zero — the same rule AdminDashboardService applies to its "Fake Reports" tile,
 * and the reason the old docs became untrustworthy.
 *
 * Statuses are DERIVED throughout (report-effective-status.ts). Analytics is
 * where trusting `status_id` would do the most damage: this database would
 * report 50 live requests and zero expired ones, when the truth is 3 and 21.
 */
@Injectable()
export class AdminAnalyticsService {
  async overview(query: AnalyticsDto) {
    const { timeZone, bucket } = query;

    // Defaults resolved here, not in the DTO: "30 days ago" has to be computed
    // against the requested zone's clock, and a schema-level default would bake
    // in UTC's.
    const to = query.to ?? new Date();
    const from =
      query.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // gte/lte, not a raw sql template. Drizzle's operators carry the column's
    // type through to the driver; a bare `sql`${col} >= ${date}`` hands
    // postgres.js an unhinted parameter and it throws ERR_INVALID_ARG_TYPE on
    // the Date. Found by the first live curl, not by a type error — the raw
    // template type-checks perfectly and fails at runtime.
    const inRange = (column: PgColumn) =>
      and(gte(column, from), lte(column, to));

    // date_trunc in the reader's zone, then back to timestamptz so the label is
    // the local calendar bucket rather than UTC's.
    const bucketOf = (column: unknown) =>
      sql<string>`to_char(date_trunc(${bucket}, ${column} AT TIME ZONE ${timeZone}), 'YYYY-MM-DD')`;

    const [
      reportsOverTime,
      reportsByCategory,
      statusBreakdown,
      missionStats,
      responseTimes,
      userGrowth,
      userTotals,
      topDistricts,
    ] = await Promise.all([
      db
        .select({
          bucket: bucketOf(reports.createdAt),
          total: sql<string>`count(*)`,
          completed: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'completed')`,
          expired: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'expired')`,
        })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .where(and(isNull(reports.deletedAt), inRange(reports.createdAt)))
        // GROUP BY 1, not a repeat of the expression: bucketOf() renders fresh
        // bind placeholders each time it is called, so Postgres sees the SELECT
        // and GROUP BY versions as different expressions ($1 vs $3) and refuses
        // with "must appear in the GROUP BY clause". The ordinal refers to the
        // already-computed output column.
        .groupBy(sql`1`)
        .orderBy(sql`1`),

      db
        .select({
          key: reportCategories.key,
          label: reportCategories.label,
          emoji: reportCategories.emoji,
          total: sql<string>`count(*)`,
          open: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'open')`,
          expired: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'expired')`,
          completed: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'completed')`,
        })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .where(and(isNull(reports.deletedAt), inRange(reports.createdAt)))
        .groupBy(
          reportCategories.key,
          reportCategories.label,
          reportCategories.emoji,
        )
        .orderBy(sql`count(*) desc`),

      db
        .select({
          open: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'open')`,
          expired: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'expired')`,
          closed: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'closed')`,
          completed: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'completed')`,
          deleted: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'deleted')`,
          total: sql<string>`count(*)`,
        })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .where(inRange(reports.createdAt)),

      db
        .select({
          missions: sql<string>`count(distinct ${missions.id})`,
          completed: sql<string>`count(distinct ${missionCompletions.missionId})`,
        })
        .from(missions)
        .innerJoin(reports, eq(missions.reportId, reports.id))
        .leftJoin(
          missionCompletions,
          eq(missionCompletions.missionId, missions.id),
        )
        .where(and(isNull(reports.deletedAt), inRange(reports.createdAt))),

      // Percentiles, not averages: one report that sat for three days would drag
      // a mean far away from what a typical requester actually experiences.
      db
        .select({
          acceptP50: sql<string | null>`percentile_cont(0.5) within group (
            order by extract(epoch from ${missionVolunteers.joinedAt} - ${reports.createdAt}) / 60
          )`,
          acceptP90: sql<string | null>`percentile_cont(0.9) within group (
            order by extract(epoch from ${missionVolunteers.joinedAt} - ${reports.createdAt}) / 60
          )`,
          sampleSize: sql<string>`count(*)`,
        })
        .from(reports)
        .innerJoin(missions, eq(missions.reportId, reports.id))
        // The FIRST volunteer to join is the one that defines response time; a
        // later joiner is not a slower response, it is a second responder.
        .innerJoin(
          missionVolunteers,
          and(
            eq(missionVolunteers.missionId, missions.id),
            sql`${missionVolunteers.joinedAt} = (
              select min(mv2.joined_at) from mission_volunteers mv2
              where mv2.mission_id = ${missions.id}
            )`,
          ),
        )
        .where(and(isNull(reports.deletedAt), inRange(reports.createdAt))),

      db
        .select({
          bucket: bucketOf(user.createdAt),
          newUsers: sql<string>`count(*)`,
        })
        .from(user)
        .where(
          and(
            inRange(user.createdAt),
            sql`not exists (select 1 from ${adminUsers} where ${adminUsers.userId} = ${user.id})`,
          ),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`),

      db
        .select({ total: sql<string>`count(*)` })
        .from(user)
        .where(
          sql`not exists (select 1 from ${adminUsers} where ${adminUsers.userId} = ${user.id})`,
        ),

      db
        .select({
          district: user.district,
          reports: sql<string>`count(*)`,
        })
        .from(reports)
        .innerJoin(user, eq(reports.reporterId, user.id))
        .where(
          and(
            isNull(reports.deletedAt),
            sql`${user.district} is not null`,
            inRange(reports.createdAt),
          ),
        )
        .groupBy(user.district)
        .orderBy(sql`count(*) desc`)
        .limit(10),
    ]);

    const missionsCreated = Number(missionStats[0]?.missions ?? 0);
    const missionsCompleted = Number(missionStats[0]?.completed ?? 0);

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        timeZone,
        bucket,
      },

      reportsOverTime: reportsOverTime.map((r) => ({
        bucket: r.bucket,
        total: Number(r.total),
        completed: Number(r.completed),
        expired: Number(r.expired),
      })),

      reportsByCategory: reportsByCategory.map((c) => ({
        key: c.key,
        label: c.label,
        emoji: c.emoji,
        total: Number(c.total),
        open: Number(c.open),
        expired: Number(c.expired),
        completed: Number(c.completed),
      })),

      reportsByStatus: {
        open: Number(statusBreakdown[0]?.open ?? 0),
        expired: Number(statusBreakdown[0]?.expired ?? 0),
        closed: Number(statusBreakdown[0]?.closed ?? 0),
        completed: Number(statusBreakdown[0]?.completed ?? 0),
        deleted: Number(statusBreakdown[0]?.deleted ?? 0),
        total: Number(statusBreakdown[0]?.total ?? 0),
      },

      missions: {
        created: missionsCreated,
        completed: missionsCompleted,
        // null, not 0, when there is nothing to divide. A 0% completion rate
        // with no missions would read as total failure rather than no data.
        completionRate:
          missionsCreated === 0
            ? null
            : Math.round((missionsCompleted / missionsCreated) * 1000) / 10,
      },

      responseTime: {
        unit: 'minutes',
        firstAcceptP50: this.toNumberOrNull(responseTimes[0]?.acceptP50),
        firstAcceptP90: this.toNumberOrNull(responseTimes[0]?.acceptP90),
        sampleSize: Number(responseTimes[0]?.sampleSize ?? 0),
      },

      userGrowth: {
        buckets: userGrowth.map((u) => ({
          bucket: u.bucket,
          newUsers: Number(u.newUsers),
        })),
        // Staff excluded, matching the Dashboard's totalUsers so the two agree.
        totalUsers: Number(userTotals[0]?.total ?? 0),
      },

      geography: {
        /**
         * IMPORTANT, and returned in the payload rather than left to a comment:
         * `reports` has no district column — location is lat/lng only. This
         * groups by the REPORTER'S profile district, which is where they say
         * they live, not necessarily where the report is. Someone from Chennai
         * reporting while visiting Madurai counts as Chennai.
         *
         * Open question 6 (docs/_audit/open-questions.md): use this, or
         * reverse-geocode lat/lng? Until that is answered the console must
         * label the chart with this caveat rather than implying the number
         * means something it does not.
         */
        basis: 'reporter_profile_district',
        caveat:
          "Grouped by the reporter's profile district, not the report's location. Reports have no district column.",
        topDistricts: topDistricts.map((d) => ({
          district: d.district,
          reports: Number(d.reports),
        })),
      },

      generatedAt: new Date().toISOString(),
    };
  }

  /** percentile_cont returns null for an empty set — keep that, don't coerce to 0. */
  private toNumberOrNull(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return Math.round(Number(value) * 10) / 10;
  }
}
