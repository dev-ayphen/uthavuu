import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletionStatuses,
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { Paginated } from './admin-pagination';
import type { ListImpactStoriesDto } from './dto/list-impact-stories.dto';

/**
 * Community -> Impact Stories. Read-only.
 *
 * ==========================================================================
 * MISSION CHAT IS NEVER PROJECTED HERE. `mission_messages` is not imported by
 * this file and must not be.
 * ==========================================================================
 *
 * ADR 0010 ("Mission Chat is not readable by admins in V1") names *exactly*
 * this file's shape as the accident it exists to prevent: `mission_messages`
 * sits next to `mission_volunteers` and `mission_completions` in the same
 * schema file, and a mission-shaped detail projection is where it gets joined
 * in "because the projection happened to include it". It is one line at the
 * keyboard and a broken product promise in the world.
 * `admin-impact-stories.service.spec.ts` seeds a real mission message and
 * serialises the entire payload of BOTH endpoints to assert its absence —
 * whole-payload serialisation rather than a key-by-key check, because the
 * failure mode being guarded against is a field somebody adds later.
 *
 * WHAT AN IMPACT STORY IS. Not a new object: BR-1 of docs/features/impact-story.md
 * says the story is the existing report/mission/completion data rendered
 * differently. So this service invents no table, no status and no workflow — it
 * is a projection over `mission_completions` -> `missions` -> `reports` (+
 * `report_photos` for the before shot). Nothing here writes anything.
 *
 * NO APPROVAL QUEUE. The console's `impactStoriesPending` nav badge implies one.
 * There is none: `MissionsService.complete()` inserts the completion already
 * `verified`, in the same statement. Whether Impact Stories *should* be moderated
 * is open question 12 (docs/_audit/open-questions.md) and is undecided, so this
 * pass reports the completion status that genuinely exists rather than inventing
 * a review state. This is also why the service is read-only and records no audit
 * entries — ADR 0012 scopes the audit log to mutations, and there are none.
 *
 * WHY NOT REUSE ImpactStoriesService (the citizen one). It answers a different
 * question: "the stories *I* am in", assembled from `ReportsService.listMine()`
 * + `MissionsService.listMyMissions()` for one caller, unpaginated, with the
 * citizen redaction applied. An admin has no `me` to scope to, needs every
 * story, needs a page at a time, and needs the before/after pair and the
 * duration that the citizen list does not carry. Per ADR 0009 that is a
 * dedicated admin projection, not a role branch in the citizen service — and
 * the citizen service is left untouched.
 */

/** Whichever `user` row is the reporter — aliased so the helper can join too. */
const reporterUser = alias(user, 'reporter_user');
/** The volunteer who submitted the completion. */
const helperUser = alias(user, 'helper_user');

/**
 * The report's first photo — the "before" half of the story.
 *
 * A scalar subquery rather than a join + group-by: it is evaluated only for the
 * rows on the requested page, and it cannot multiply the result set the way a
 * plain join to a 1:N table would. `created_at` then `id` (uuidv7, time-ordered)
 * so "first" is deterministic when two photos share a timestamp — which they do,
 * because a multi-photo report inserts them in one statement.
 */
const beforePhotoUrlSql = sql<string | null>`(
  select ${reportPhotos.url} from ${reportPhotos}
  where ${reportPhotos.reportId} = ${reports.id}
  order by ${reportPhotos.createdAt} asc, ${reportPhotos.id} asc
  limit 1
)`;

export interface ImpactStoryListItem {
  /** The `mission_completions` id — the story IS the completion (BR-1). */
  id: string;
  reportId: string;
  reportTitle: string;
  category: { key: string; label: string };
  /** From `mission_completion_statuses`. Today always `verified`; see above. */
  status: { key: string; label: string };
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  durationMinutes: number | null;
  reporter: { id: string; name: string | null } | null;
  reporterDeleted: boolean;
  reporterAnonymous: boolean;
  helper: { id: string; name: string | null } | null;
  helperDeleted: boolean;
}

export interface ImpactStoryDetail extends ImpactStoryListItem {
  /** The completion note — reused as the story's caption (BR-2). */
  note: string | null;
  reportDescription: string | null;
  /** Every report photo, oldest first. `beforePhotoUrl` is photos[0]. */
  photos: string[];
  volunteers: {
    userId: string | null;
    name: string | null;
    status: { key: string; label: string };
  }[];
}

/** The row shape both projections share, before it is turned into a story. */
interface StoryRow {
  id: string;
  reportId: string;
  reportTitle: string;
  categoryKey: string;
  categoryLabel: string;
  statusKey: string;
  statusLabel: string;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string;
  submittedAt: Date;
  verifiedAt: Date | null;
  reportCreatedAt: Date;
  anonymous: boolean;
  reporterId: string | null;
  reporterName: string | null;
  helperId: string | null;
  helperName: string | null;
}

@Injectable()
export class AdminImpactStoriesService {
  /**
   * The story list, newest first.
   *
   * JOIN DIRECTION, and why invariant 6 is satisfied rather than broken.
   * docs/architecture/data.md invariant 6 says a mission is created lazily, so
   * a report must be reached with a LEFT JOIN or open reports vanish. That
   * applies to queries whose subject is a *report*. This query's subject is a
   * *completion*: a story exists if and only if `mission_completions` has a
   * row, and a completion cannot exist without its mission (NOT NULL FK) or its
   * report (NOT NULL FK on `missions`). Driving from `mission_completions`
   * inward therefore drops nothing — there is no report without a mission to
   * lose, because a report without a mission has no story. The LEFT JOINs are
   * on `user`, which is where rows genuinely can be missing (SET NULL on
   * account deletion, invariant 2).
   */
  async list(
    query: ListImpactStoriesDto,
  ): Promise<Paginated<ImpactStoryListItem>> {
    const filters = [
      // Invariant 1. A soft-deleted report has been removed from the product,
      // so its Impact Story goes with it. There is deliberately no
      // `includeDeleted` escape hatch here — see the DTO for the reasoning.
      isNull(reports.deletedAt),
      query.categoryKey
        ? eq(reportCategories.key, query.categoryKey)
        : undefined,
      query.q ? ilike(reports.title, likePattern(query.q)) : undefined,
      // Bounds on when the story happened, not on when the request was raised.
      query.from ? gte(missionCompletions.submittedAt, query.from) : undefined,
      query.to ? lte(missionCompletions.submittedAt, query.to) : undefined,
    ].filter((filter) => filter !== undefined);

    const where = and(...filters);

    const [rows, [countRow]] = await Promise.all([
      db
        .select(this.storyColumns())
        .from(missionCompletions)
        .innerJoin(missions, eq(missionCompletions.missionId, missions.id))
        .innerJoin(reports, eq(missions.reportId, reports.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .innerJoin(
          missionCompletionStatuses,
          eq(missionCompletions.statusId, missionCompletionStatuses.id),
        )
        .leftJoin(reporterUser, eq(reports.reporterId, reporterUser.id))
        .leftJoin(
          helperUser,
          eq(missionCompletions.completedById, helperUser.id),
        )
        .where(where)
        // Tie-break on the completion id (uuidv7, time-ordered) so paging is
        // stable when two stories share a `submitted_at` — without it a row can
        // appear on two pages and another on none.
        .orderBy(
          desc(missionCompletions.submittedAt),
          desc(missionCompletions.id),
        )
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(missionCompletions)
        .innerJoin(missions, eq(missionCompletions.missionId, missions.id))
        .innerJoin(reports, eq(missions.reportId, reports.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .innerJoin(
          missionCompletionStatuses,
          eq(missionCompletions.statusId, missionCompletionStatuses.id),
        )
        .where(where),
    ]);

    return paginate(
      rows.map((row) => this.toListItem(row)),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  /** One story, by its completion id, with the full photo set and the roster. */
  async findOne(completionId: string): Promise<ImpactStoryDetail> {
    const [row] = await db
      .select({
        ...this.storyColumns(),
        missionId: missionCompletions.missionId,
        note: missionCompletions.note,
        reportDescription: reports.description,
      })
      .from(missionCompletions)
      .innerJoin(missions, eq(missionCompletions.missionId, missions.id))
      .innerJoin(reports, eq(missions.reportId, reports.id))
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(
        missionCompletionStatuses,
        eq(missionCompletions.statusId, missionCompletionStatuses.id),
      )
      .leftJoin(reporterUser, eq(reports.reporterId, reporterUser.id))
      .leftJoin(helperUser, eq(missionCompletions.completedById, helperUser.id))
      .where(
        and(
          eq(missionCompletions.id, completionId),
          // Same rule as the list, on purpose: a story the list will not show
          // is a story this endpoint will not show either. The frozen response
          // shape has no field in which to disclose "the underlying report was
          // removed", so rendering one anyway would be a silent half-truth.
          // Reviewing a removal is `GET /admin/reports/:id`, which does reach
          // deleted rows and does name who removed them.
          isNull(reports.deletedAt),
        ),
      );

    if (!row) {
      throw new NotFoundException({
        code: 'IMPACT_STORY_NOT_FOUND',
        message: 'No impact story with that id.',
      });
    }

    const [photos, volunteers] = await Promise.all([
      db
        .select({ url: reportPhotos.url })
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, row.reportId))
        .orderBy(asc(reportPhotos.createdAt), asc(reportPhotos.id)),

      db
        .select({
          volunteerId: missionVolunteers.volunteerId,
          name: user.name,
          statusKey: missionVolunteerStatuses.key,
          statusLabel: missionVolunteerStatuses.label,
        })
        .from(missionVolunteers)
        .innerJoin(
          missionVolunteerStatuses,
          eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
        )
        // leftJoin: volunteer_id is SET NULL, so a roster entry survives the
        // volunteer deleting their account (invariant 2). innerJoin would erase
        // exactly the people whose participation the SET NULL policy exists to
        // preserve — and an Impact Story is community history.
        .leftJoin(user, eq(missionVolunteers.volunteerId, user.id))
        .where(eq(missionVolunteers.missionId, row.missionId))
        .orderBy(asc(missionVolunteers.joinedAt), asc(missionVolunteers.id)),
    ]);

    return {
      ...this.toListItem(row),
      note: row.note,
      reportDescription: row.reportDescription,
      photos: photos.map((photo) => photo.url),
      volunteers: volunteers.map((volunteer) => ({
        userId: volunteer.volunteerId,
        // Null id and null name travel together: "Deleted User" is a fact about
        // the account, and the console must not render a stale name beside a
        // missing id.
        name: volunteer.volunteerId === null ? null : volunteer.name,
        // The STORED status, deliberately — the same value
        // AdminReportsService.findOne() projects, so the two admin screens can
        // never disagree about one roster. Caveat worth knowing (invariant 5):
        // `mission_volunteers.status` is evaluated lazily, so a row can still
        // read `joined` past its 15-minute confirm deadline until something
        // calls MissionsService.expireStaleAndListVolunteers(). On a COMPLETED
        // mission that is close to harmless — the mission ended — but it is why
        // this must never be counted as "currently helping".
        status: { key: volunteer.statusKey, label: volunteer.statusLabel },
      })),
    };
  }

  /** The columns every story projection selects. One definition, two queries. */
  private storyColumns() {
    return {
      id: missionCompletions.id,
      reportId: reports.id,
      reportTitle: reports.title,
      categoryKey: reportCategories.key,
      categoryLabel: reportCategories.label,
      statusKey: missionCompletionStatuses.key,
      statusLabel: missionCompletionStatuses.label,
      beforePhotoUrl: beforePhotoUrlSql,
      afterPhotoUrl: missionCompletions.photoUrl,
      submittedAt: missionCompletions.submittedAt,
      verifiedAt: missionCompletions.verifiedAt,
      reportCreatedAt: reports.createdAt,
      anonymous: reports.anonymous,
      reporterId: reports.reporterId,
      reporterName: reporterUser.name,
      helperId: missionCompletions.completedById,
      helperName: helperUser.name,
    };
  }

  private toListItem(row: StoryRow): ImpactStoryListItem {
    return {
      id: row.id,
      reportId: row.reportId,
      reportTitle: row.reportTitle,
      category: { key: row.categoryKey, label: row.categoryLabel },
      status: { key: row.statusKey, label: row.statusLabel },
      beforePhotoUrl: row.beforePhotoUrl,
      afterPhotoUrl: row.afterPhotoUrl,
      submittedAt: row.submittedAt.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      durationMinutes: this.durationMinutes(
        row.reportCreatedAt,
        row.submittedAt,
      ),

      // reporter === null and anonymous === true are DIFFERENT FACTS and stay
      // separately readable (invariant 3): "the account is gone" is not
      // "they chose not to be named", and a console that conflates them will
      // label a deleted user as anonymous or vice versa.
      //
      // ANONYMITY IS NOT REDACTED HERE, matching the provisional call already
      // shipped in AdminReportsService.reporterProjection() — staff see the
      // identity with an explicit flag, because GET /admin/users/:id already
      // lists a user's anonymous reports and hiding it on one screen while the
      // next screen shows it is theatre, not protection. That is open question 2
      // and it is NOT settled; if the owner rules the other way, this method and
      // `reporterProjection()` are the places to change.
      reporter:
        row.reporterId === null
          ? null
          : { id: row.reporterId, name: row.reporterName },
      reporterDeleted: row.reporterId === null,
      reporterAnonymous: row.anonymous,

      // `completed_by_id` is always written at completion
      // (MissionsService.complete()), so null here means exactly one thing: the
      // helper deleted their account and SET NULL took the identity while
      // leaving the completion as community history.
      helper:
        row.helperId === null
          ? null
          : { id: row.helperId, name: row.helperName },
      helperDeleted: row.helperId === null,
    };
  }

  /**
   * How long the help took: report raised -> completion submitted.
   *
   * Null rather than a negative number when the completion predates the report.
   * That is not a real timeline, it is corrupt or hand-seeded data, and
   * "-14 minutes" rendered in a console reads as a bug in the console rather
   * than in the row.
   */
  private durationMinutes(
    reportCreatedAt: Date,
    submittedAt: Date,
  ): number | null {
    const elapsedMs = submittedAt.getTime() - reportCreatedAt.getTime();
    if (elapsedMs < 0) return null;
    return Math.round(elapsedMs / 60_000);
  }
}
