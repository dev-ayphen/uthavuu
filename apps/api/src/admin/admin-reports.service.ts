import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletionStatuses,
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
  progressStatuses,
} from '../db/schema/missions-schema';
import { reportComments } from '../db/schema/comments-schema';
import { reportSaves } from '../db/schema/saves-schema';
import { effectiveStatusSql } from '../reports/report-effective-status';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { ListAdminReportsDto } from './dto/list-admin-reports.dto';

/**
 * Reports -> list and detail. The console's biggest section, and the one with
 * no reusable surface at all.
 *
 * WHY THIS DOES NOT CALL ReportsService.list(). Three reasons, all structural
 * (ADR 0009, docs/architecture/admin-console-integration.md §3 gap R-1):
 *
 *  1. Its DTO *requires* categoryKey + lat + lng + radiusKm and the query
 *     hard-filters to status='open'. An admin has no location and needs every
 *     status — including the ones a citizen can no longer see.
 *  2. It runs `hasActiveAccess()` and `hasAnyActiveVolunteer()` PER ROW from
 *     application code, several round trips each. Fine for ~20 nearby cards,
 *     ruinous for a 500-row table. Everything this service needs per row is a
 *     scalar subquery inside the one statement the planner sees.
 *  3. Its projection is a citizen projection: it redacts the reporter, computes
 *     isOwner/savedByMe/editable relative to the caller, and gates
 *     reporterPhone. Those fields are meaningless for staff, and — the part
 *     that matters — the redaction logic is a security boundary. ADR 0009 keeps
 *     it branch-free rather than adding an `if (isAdmin)` escape hatch inside
 *     the function that implements the gate.
 *
 * MISSION CHAT IS NEVER PROJECTED HERE. `mission_messages` is not imported by
 * this file and must not be. The product markets chat as private, the owner has
 * confirmed admins get no access to it, and CLAUDE.md calls the `hasAccepted`
 * gate a security boundary rather than a UI filter. A detail endpoint that
 * returned messages "because the projection happened to include them" is exactly
 * how a marketed guarantee becomes an implementation detail.
 * admin-reports.service.spec.ts asserts the absence.
 */
@Injectable()
export class AdminReportsService {
  async list(query: ListAdminReportsDto) {
    const filters = [
      // Status, derived. `deleted` beats every other value, so asking for it
      // implies including it; asking for anything else can never match a
      // deleted row anyway.
      query.status === 'deleted'
        ? eq(effectiveStatusSql, 'deleted')
        : query.status === 'all'
          ? query.includeDeleted
            ? undefined
            : ne(effectiveStatusSql, 'deleted')
          : eq(effectiveStatusSql, query.status),

      query.categoryKey
        ? eq(reportCategories.key, query.categoryKey)
        : undefined,
      query.reporterId ? eq(reports.reporterId, query.reporterId) : undefined,
      query.q
        ? or(
            ilike(reports.title, likePattern(query.q)),
            ilike(reports.description, likePattern(query.q)),
            ilike(reports.landmark, likePattern(query.q)),
          )
        : undefined,
      query.from ? gte(reports.createdAt, query.from) : undefined,
      query.to ? lte(reports.createdAt, query.to) : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    // Scalar subqueries, evaluated only for the rows on the requested page —
    // see the per-row note in the class doc comment.
    const photoCount = sql<string>`(
      select count(*) from ${reportPhotos} where ${reportPhotos.reportId} = ${reports.id}
    )`;
    const commentCount = sql<string>`(
      select count(*) from ${reportComments}
      where ${reportComments.reportId} = ${reports.id} and ${reportComments.deletedAt} is null
    )`;
    // Volunteers who have CONFIRMED — the same definition of "active" the
    // dashboard's activeMissions counter uses. Volunteers still inside the
    // 15-minute window have not started helping.
    const activeVolunteerCount = sql<string>`(
      select count(*) from ${missionVolunteers}
      join ${missions} on ${missions.id} = ${missionVolunteers.missionId}
      join ${missionVolunteerStatuses} on ${missionVolunteerStatuses.id} = ${missionVolunteers.statusId}
      where ${missions.reportId} = ${reports.id} and ${missionVolunteerStatuses.key} = 'active'
    )`;

    const direction = query.order === 'asc' ? asc : desc;
    const sortColumn =
      query.sort === 'expiryAt'
        ? reports.expiryAt
        : query.sort === 'title'
          ? reports.title
          : reports.createdAt;

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: reports.id,
          title: reports.title,
          description: reports.description,
          lat: reports.lat,
          lng: reports.lng,
          landmark: reports.landmark,
          anonymous: reports.anonymous,
          phoneVisible: reports.phoneVisible,
          neededVolunteers: reports.neededVolunteers,
          createdAt: reports.createdAt,
          expiryAt: reports.expiryAt,
          closedAt: reports.closedAt,
          deletedAt: reports.deletedAt,
          effectiveStatus: effectiveStatusSql,
          storedStatus: reportStatuses.key,
          categoryKey: reportCategories.key,
          categoryLabel: reportCategories.label,
          categoryEmoji: reportCategories.emoji,
          reporterId: reports.reporterId,
          reporterName: user.name,
          reporterAvatarUrl: user.avatarUrl,
          reporterPhone: user.phoneNumber,
          photoCount,
          commentCount,
          activeVolunteerCount,
        })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        // leftJoin: reporterId is SET NULL, so a report whose reporter deleted
        // their account must still be listed. innerJoin would hide exactly the
        // reports that outlive their author, which is the case the SET NULL
        // policy exists to preserve.
        .leftJoin(user, eq(reports.reporterId, user.id))
        .where(where)
        // Tie-break on id (uuidv7, time-ordered) so paging is stable when two
        // rows share a sort value — without it a row can appear on two pages.
        .orderBy(direction(sortColumn), desc(reports.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .leftJoin(user, eq(reports.reporterId, user.id))
        .where(where),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.effectiveStatus,
        // Both, always. The console can show the divergence, and anyone reading
        // a response can see that `open` in the database means `expired` in
        // fact — rather than wondering why the two disagree.
        storedStatus: row.storedStatus,
        category: {
          key: row.categoryKey,
          label: row.categoryLabel,
          emoji: row.categoryEmoji,
        },
        reporter: this.reporterProjection(row),
        anonymous: row.anonymous,
        phoneVisible: row.phoneVisible,
        location: { lat: row.lat, lng: row.lng, landmark: row.landmark },
        neededVolunteers: row.neededVolunteers,
        counts: {
          photos: Number(row.photoCount),
          comments: Number(row.commentCount),
          activeVolunteers: Number(row.activeVolunteerCount),
        },
        createdAt: row.createdAt.toISOString(),
        expiryAt: row.expiryAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
        deletedAt: row.deletedAt?.toISOString() ?? null,
      })),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  /**
   * The reporter, for staff.
   *
   * ANONYMITY — a deliberate, and reversible, call. `reports.anonymous` hides
   * the reporter's name from other CITIZENS (ReportsService.toResponse()). This
   * projection still returns the identity to staff, with `anonymousToPublic`
   * set so the console can label it rather than presenting it as public.
   *
   * The reasoning is consistency, not convenience: `GET /admin/users/:id`
   * already lists every report a user posted, anonymous ones included, because
   * `reports.reporter_id` is a plain FK. Redacting the same fact here would be
   * security theatre — one screen hiding what the next screen shows — not a
   * protection. Better to expose it in one documented place than to imply a
   * guarantee the schema does not make.
   *
   * This is open question 2 in docs/_audit/open-questions.md and it is NOT
   * settled. If the owner rules that staff must not see the person behind an
   * anonymous report, this method is the single place to change, and the fix is
   * to redact here AND in AdminUsersService.recentReportsFor().
   */
  private reporterProjection(row: {
    reporterId: string | null;
    reporterName: string | null;
    reporterAvatarUrl: string | null;
    reporterPhone: string | null;
    anonymous: boolean;
  }) {
    // Distinct from `anonymous`: the account is gone, so there is no identity
    // to show anyone. The citizen projection keeps these two apart for the same
    // reason (reports.service.ts toResponse) — "Deleted User" and "Posted
    // anonymously" are different facts and must never be conflated.
    if (row.reporterId === null) {
      return {
        id: null,
        deleted: true,
        anonymousToPublic: row.anonymous,
        name: null,
        avatarUrl: null,
        phoneNumber: null,
      };
    }
    return {
      id: row.reporterId,
      deleted: false,
      anonymousToPublic: row.anonymous,
      name: row.reporterName,
      avatarUrl: row.reporterAvatarUrl,
      phoneNumber: row.reporterPhone,
    };
  }

  /** One report, with photos, the volunteer roster and the completion. */
  async findOne(reportId: string) {
    const [row] = await db
      .select({
        id: reports.id,
        title: reports.title,
        description: reports.description,
        lat: reports.lat,
        lng: reports.lng,
        landmark: reports.landmark,
        anonymous: reports.anonymous,
        phoneVisible: reports.phoneVisible,
        neededVolunteers: reports.neededVolunteers,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        expiryAt: reports.expiryAt,
        closedAt: reports.closedAt,
        deletedAt: reports.deletedAt,
        deletedBy: reports.deletedBy,
        effectiveStatus: effectiveStatusSql,
        storedStatus: reportStatuses.key,
        storedStatusLabel: reportStatuses.label,
        categoryKey: reportCategories.key,
        categoryLabel: reportCategories.label,
        categoryEmoji: reportCategories.emoji,
        reporterId: reports.reporterId,
        reporterName: user.name,
        reporterAvatarUrl: user.avatarUrl,
        reporterPhone: user.phoneNumber,
        reporterCity: user.city,
        reporterDistrict: user.district,
      })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .leftJoin(user, eq(reports.reporterId, user.id))
      .where(eq(reports.id, reportId));

    if (!row) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'No report with that id.',
      });
    }

    const [
      photos,
      volunteers,
      completion,
      commentCountRow,
      saveCountRow,
      deletedByRow,
    ] = await Promise.all([
      db
        .select({
          id: reportPhotos.id,
          url: reportPhotos.url,
          createdAt: reportPhotos.createdAt,
        })
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, reportId))
        .orderBy(asc(reportPhotos.createdAt)),

      db
        .select({
          id: missionVolunteers.id,
          volunteerId: missionVolunteers.volunteerId,
          name: user.name,
          avatarUrl: user.avatarUrl,
          phoneNumber: user.phoneNumber,
          statusKey: missionVolunteerStatuses.key,
          statusLabel: missionVolunteerStatuses.label,
          progressKey: progressStatuses.key,
          joinedAt: missionVolunteers.joinedAt,
          confirmDeadline: missionVolunteers.confirmDeadline,
          confirmedAt: missionVolunteers.confirmedAt,
          releasedAt: missionVolunteers.releasedAt,
          releaseReason: missionVolunteers.releaseReason,
        })
        .from(missionVolunteers)
        .innerJoin(missions, eq(missionVolunteers.missionId, missions.id))
        .innerJoin(
          missionVolunteerStatuses,
          eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
        )
        .leftJoin(
          progressStatuses,
          eq(missionVolunteers.progressStatusId, progressStatuses.id),
        )
        .leftJoin(user, eq(missionVolunteers.volunteerId, user.id))
        .where(eq(missions.reportId, reportId))
        .orderBy(asc(missionVolunteers.joinedAt)),

      db
        .select({
          id: missionCompletions.id,
          photoUrl: missionCompletions.photoUrl,
          note: missionCompletions.note,
          submittedAt: missionCompletions.submittedAt,
          verifiedAt: missionCompletions.verifiedAt,
          statusKey: missionCompletionStatuses.key,
          completedById: missionCompletions.completedById,
          completedByName: user.name,
        })
        .from(missionCompletions)
        .innerJoin(missions, eq(missionCompletions.missionId, missions.id))
        .innerJoin(
          missionCompletionStatuses,
          eq(missionCompletions.statusId, missionCompletionStatuses.id),
        )
        .leftJoin(user, eq(missionCompletions.completedById, user.id))
        .where(eq(missions.reportId, reportId)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reportComments)
        .where(
          and(
            eq(reportComments.reportId, reportId),
            isNull(reportComments.deletedAt),
          ),
        ),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reportSaves)
        .where(eq(reportSaves.reportId, reportId)),

      row.deletedBy
        ? db
            .select({ id: user.id, name: user.name, email: user.email })
            .from(user)
            .where(eq(user.id, row.deletedBy))
        : Promise.resolve([]),
    ]);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.effectiveStatus,
      storedStatus: row.storedStatus,
      storedStatusLabel: row.storedStatusLabel,
      // Stated outright so a reader never has to infer it: this is why `status`
      // and `storedStatus` can disagree.
      expired: row.effectiveStatus === 'expired',
      category: {
        key: row.categoryKey,
        label: row.categoryLabel,
        emoji: row.categoryEmoji,
      },
      reporter: {
        ...this.reporterProjection(row),
        city: row.reporterCity,
        district: row.reporterDistrict,
      },
      anonymous: row.anonymous,
      phoneVisible: row.phoneVisible,
      location: { lat: row.lat, lng: row.lng, landmark: row.landmark },
      neededVolunteers: row.neededVolunteers,
      photos: photos.map((p) => ({
        id: p.id,
        url: p.url,
        createdAt: p.createdAt.toISOString(),
      })),
      volunteers: volunteers.map((v) => ({
        id: v.id,
        userId: v.volunteerId,
        name: v.volunteerId === null ? null : v.name,
        deleted: v.volunteerId === null,
        avatarUrl: v.avatarUrl,
        phoneNumber: v.phoneNumber,
        status: { key: v.statusKey, label: v.statusLabel },
        progress: v.progressKey,
        joinedAt: v.joinedAt.toISOString(),
        confirmDeadline: v.confirmDeadline.toISOString(),
        confirmedAt: v.confirmedAt?.toISOString() ?? null,
        releasedAt: v.releasedAt?.toISOString() ?? null,
        releaseReason: v.releaseReason,
      })),
      completion: completion[0]
        ? {
            id: completion[0].id,
            photoUrl: completion[0].photoUrl,
            note: completion[0].note,
            status: completion[0].statusKey,
            submittedAt: completion[0].submittedAt.toISOString(),
            verifiedAt: completion[0].verifiedAt?.toISOString() ?? null,
            completedBy: completion[0].completedById
              ? {
                  id: completion[0].completedById,
                  name: completion[0].completedByName,
                }
              : null,
          }
        : null,
      counts: {
        photos: photos.length,
        comments: Number(commentCountRow[0]?.count ?? 0),
        saves: Number(saveCountRow[0]?.count ?? 0),
        volunteers: volunteers.length,
        activeVolunteers: volunteers.filter((v) => v.statusKey === 'active')
          .length,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiryAt: row.expiryAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      deletedBy: deletedByRow[0]
        ? {
            id: deletedByRow[0].id,
            name: deletedByRow[0].name,
            email: deletedByRow[0].email,
          }
        : null,
    };
  }
}
