import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminRoles, adminUsers } from '../db/schema/admin-schema';
import {
  userAccountStatus,
  userStatuses,
} from '../db/schema/user-status-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import {
  reportComments,
  reportCommentFlags,
} from '../db/schema/comments-schema';
import { supportTickets } from '../db/schema/tickets-schema';
import {
  ACTIVE_STATUS_KEY,
  SUSPENDED_STATUS_KEY,
} from '../account-status/account-status';
import { AdminAuditService } from './admin-audit.service';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { ReactivateUserDto, SuspendUserDto } from './dto/suspend-user.dto';
import { effectiveStatusSql } from '../reports/report-effective-status';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { ListAdminUsersDto } from './dto/list-admin-users.dto';

/**
 * Users -> list and detail.
 *
 * Every citizen-facing user route in this API is `/users/me/*` and takes the
 * caller's own id (users.controller.ts). There is deliberately no way to widen
 * one — that would be a privilege-escalation surface on the most-called
 * endpoints in the product (ADR 0009). So this is a separate read surface with
 * its own projection, which is also the only place `phone_number` and
 * `contact_email` are returned for someone other than the account holder.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly auditService: AdminAuditService) {}

  /**
   * `coalesce(status, 'active')`: absence of a `user_account_status` row IS
   * active (db/schema/user-status-schema.ts). Written once here so no caller has
   * to remember that a missing row is not a missing answer.
   */
  private readonly statusKeySql = sql<string>`coalesce(${userStatuses.key}, ${ACTIVE_STATUS_KEY})`;

  async list(query: ListAdminUsersDto) {
    const filters = [
      query.q
        ? or(
            ilike(user.name, likePattern(query.q)),
            ilike(user.phoneNumber, likePattern(query.q)),
            ilike(user.email, likePattern(query.q)),
          )
        : undefined,

      // exists/notExists against admin_users rather than a join, so the row
      // count cannot change when someone is staff.
      query.audience === 'citizen'
        ? notExists(
            db
              .select({ one: sql`1` })
              .from(adminUsers)
              .where(eq(adminUsers.userId, user.id)),
          )
        : query.audience === 'staff'
          ? exists(
              db
                .select({ one: sql`1` })
                .from(adminUsers)
                .where(eq(adminUsers.userId, user.id)),
            )
          : undefined,

      query.status === 'all' ? undefined : eq(this.statusKeySql, query.status),

      query.district ? eq(user.district, query.district) : undefined,
      query.profileCompleted === undefined
        ? undefined
        : query.profileCompleted
          ? isNotNull(user.profileCompletedAt)
          : isNull(user.profileCompletedAt),
      query.from ? gte(user.createdAt, query.from) : undefined,
      query.to ? lte(user.createdAt, query.to) : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    // Correlated scalar subqueries, one index lookup each, evaluated only for
    // the rows on the requested page (at most `limit`, capped at 100). This is
    // NOT the per-row-service-call pattern that makes ReportsService.list()
    // unusable for an admin table — that runs several round trips per row from
    // application code. These stay inside the one statement the planner sees.
    // If `reports` ever grows past the point where 100 index lookups matter,
    // the fix is a grouped join over the page's ids, not dropping the columns.
    const reportsCount = sql<string>`(
      select count(*) from ${reports}
      where ${reports.reporterId} = ${user.id} and ${reports.deletedAt} is null
    )`;
    const completionsCount = sql<string>`(
      select count(*) from ${missionCompletions}
      where ${missionCompletions.completedById} = ${user.id}
    )`;

    const orderBy = (() => {
      const direction = query.order === 'asc' ? asc : desc;
      if (query.sort === 'name') return [direction(user.name), desc(user.id)];
      if (query.sort === 'reports') {
        return [
          query.order === 'asc'
            ? sql`${reportsCount} asc`
            : sql`${reportsCount} desc`,
          desc(user.createdAt),
        ];
      }
      return [direction(user.createdAt), desc(user.id)];
    })();

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          email: user.email,
          city: user.city,
          district: user.district,
          avatarUrl: user.avatarUrl,
          locale: user.locale,
          profileCompletedAt: user.profileCompletedAt,
          createdAt: user.createdAt,
          statusKey: this.statusKeySql,
          suspendedAt: userAccountStatus.suspendedAt,
          adminRoleKey: adminRoles.key,
          adminRoleLabel: adminRoles.label,
          reportsCount,
          completionsCount,
        })
        .from(user)
        .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
        .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
        .leftJoin(adminUsers, eq(adminUsers.userId, user.id))
        .leftJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(user)
        .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
        .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
        .where(where),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        phoneNumber: row.phoneNumber,
        email: row.email,
        city: row.city,
        district: row.district,
        avatarUrl: row.avatarUrl,
        locale: row.locale,
        profileCompleted: row.profileCompletedAt !== null,
        profileCompletedAt: row.profileCompletedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        status: {
          key: row.statusKey,
          suspendedAt: row.suspendedAt?.toISOString() ?? null,
        },
        // Staff are a different kind of account, not a role on a citizen.
        // Surfaced so the console can badge them when audience=all rather than
        // showing an ops login as though it were a community member.
        isStaff: row.adminRoleKey !== null,
        adminRole: row.adminRoleKey
          ? { key: row.adminRoleKey, label: row.adminRoleLabel! }
          : null,
        counts: {
          reports: Number(row.reportsCount),
          completions: Number(row.completionsCount),
        },
      })),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  /**
   * One user, with the activity the console's detail page shows.
   *
   * `reason` from `user_account_status` IS returned here — it is an internal
   * moderation note and this endpoint is admin-only. It must never reach a
   * citizen projection.
   */
  async findOne(userId: string) {
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        phoneNumberVerified: user.phoneNumberVerified,
        email: user.email,
        contactEmail: user.contactEmail,
        city: user.city,
        district: user.district,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        language: user.language,
        profession: user.profession,
        organization: user.organization,
        showProfession: user.showProfession,
        preferredRadius: user.preferredRadius,
        defaultAnonymous: user.defaultAnonymous,
        defaultPhoneVisible: user.defaultPhoneVisible,
        profileCompletedAt: user.profileCompletedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        statusKey: this.statusKeySql,
        statusLabel: userStatuses.label,
        suspendedAt: userAccountStatus.suspendedAt,
        suspendedBy: userAccountStatus.suspendedBy,
        suspensionReason: userAccountStatus.reason,
        adminRoleKey: adminRoles.key,
        adminRoleLabel: adminRoles.label,
      })
      .from(user)
      .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .leftJoin(adminUsers, eq(adminUsers.userId, user.id))
      .leftJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .where(eq(user.id, userId));

    if (!row) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'No user with that id.',
      });
    }

    const [counts, recentReports, recentMissions, suspendedByRow] =
      await Promise.all([
        this.countsFor(userId),
        this.recentReportsFor(userId),
        this.recentMissionsFor(userId),
        row.suspendedBy
          ? db
              .select({ id: user.id, name: user.name, email: user.email })
              .from(user)
              .where(eq(user.id, row.suspendedBy))
          : Promise.resolve([]),
      ]);

    return {
      id: row.id,
      name: row.name,
      phoneNumber: row.phoneNumber,
      phoneNumberVerified: row.phoneNumberVerified ?? false,
      email: row.email,
      contactEmail: row.contactEmail,
      city: row.city,
      district: row.district,
      avatarUrl: row.avatarUrl,
      locale: row.locale,
      language: row.language,
      profession: row.profession,
      organization: row.organization,
      showProfession: row.showProfession,
      preferredRadius: row.preferredRadius,
      privacyDefaults: {
        anonymous: row.defaultAnonymous,
        phoneVisible: row.defaultPhoneVisible,
      },
      profileCompleted: row.profileCompletedAt !== null,
      profileCompletedAt: row.profileCompletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      status: {
        key: row.statusKey,
        label: row.statusLabel ?? 'Active',
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        // Internal note — admin-only, see the doc comment above.
        reason: row.suspensionReason,
        suspendedBy: suspendedByRow[0]
          ? {
              id: suspendedByRow[0].id,
              name: suspendedByRow[0].name,
              email: suspendedByRow[0].email,
            }
          : null,
      },
      isStaff: row.adminRoleKey !== null,
      adminRole: row.adminRoleKey
        ? { key: row.adminRoleKey, label: row.adminRoleLabel! }
        : null,
      counts,
      recentReports,
      recentMissions,
    };
  }

  /**
   * The activity summary. Reports are counted by DERIVED status
   * (report-effective-status.ts), not `status_id` — a user with 12 reports all
   * past `expiry_at` has 0 open ones, and the stored column says otherwise for
   * every row in this database.
   */
  private async countsFor(userId: string) {
    const [
      [reportsRow],
      [volunteerRow],
      [completionsRow],
      [commentsRow],
      [flagsRow],
      [ticketsRow],
    ] = await Promise.all([
      db
        .select({
          total: sql<string>`count(*)`,
          open: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'open')`,
          expired: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'expired')`,
          closed: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'closed')`,
          completed: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'completed')`,
          deleted: sql<string>`count(*) filter (where ${effectiveStatusSql} = 'deleted')`,
        })
        .from(reports)
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .where(eq(reports.reporterId, userId)),

      db
        .select({
          total: sql<string>`count(*)`,
          active: sql<string>`count(*) filter (where ${missionVolunteerStatuses.key} = 'active')`,
          joined: sql<string>`count(*) filter (where ${missionVolunteerStatuses.key} = 'joined')`,
          released: sql<string>`count(*) filter (where ${missionVolunteerStatuses.key} = 'released')`,
        })
        .from(missionVolunteers)
        .innerJoin(
          missionVolunteerStatuses,
          eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
        )
        .where(eq(missionVolunteers.volunteerId, userId)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(missionCompletions)
        .where(eq(missionCompletions.completedById, userId)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reportComments)
        .where(
          and(
            eq(reportComments.authorId, userId),
            isNull(reportComments.deletedAt),
          ),
        ),

      db
        .select({ count: sql<string>`count(*)` })
        .from(reportCommentFlags)
        .where(eq(reportCommentFlags.flaggedById, userId)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(supportTickets)
        .where(eq(supportTickets.userId, userId)),
    ]);

    return {
      reports: {
        total: Number(reportsRow?.total ?? 0),
        open: Number(reportsRow?.open ?? 0),
        expired: Number(reportsRow?.expired ?? 0),
        closed: Number(reportsRow?.closed ?? 0),
        completed: Number(reportsRow?.completed ?? 0),
        deleted: Number(reportsRow?.deleted ?? 0),
      },
      missions: {
        total: Number(volunteerRow?.total ?? 0),
        active: Number(volunteerRow?.active ?? 0),
        joined: Number(volunteerRow?.joined ?? 0),
        released: Number(volunteerRow?.released ?? 0),
      },
      completions: Number(completionsRow?.count ?? 0),
      comments: Number(commentsRow?.count ?? 0),
      flagsRaised: Number(flagsRow?.count ?? 0),
      supportTickets: Number(ticketsRow?.count ?? 0),
    };
  }

  private async recentReportsFor(userId: string) {
    const rows = await db
      .select({
        id: reports.id,
        title: reports.title,
        createdAt: reports.createdAt,
        expiryAt: reports.expiryAt,
        effectiveStatus: effectiveStatusSql,
        storedStatus: reportStatuses.key,
        categoryKey: reportCategories.key,
        categoryLabel: reportCategories.label,
        categoryEmoji: reportCategories.emoji,
      })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .where(eq(reports.reporterId, userId))
      .orderBy(desc(reports.createdAt))
      .limit(10);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      expiryAt: r.expiryAt.toISOString(),
      status: r.effectiveStatus,
      storedStatus: r.storedStatus,
      category: {
        key: r.categoryKey,
        label: r.categoryLabel,
        emoji: r.categoryEmoji,
      },
    }));
  }

  private async recentMissionsFor(userId: string) {
    const rows = await db
      .select({
        id: missionVolunteers.id,
        missionId: missionVolunteers.missionId,
        reportId: missions.reportId,
        reportTitle: reports.title,
        joinedAt: missionVolunteers.joinedAt,
        releasedAt: missionVolunteers.releasedAt,
        volunteerStatus: missionVolunteerStatuses.key,
        reportStatus: effectiveStatusSql,
      })
      .from(missionVolunteers)
      .innerJoin(missions, eq(missionVolunteers.missionId, missions.id))
      .innerJoin(reports, eq(missions.reportId, reports.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .innerJoin(
        missionVolunteerStatuses,
        eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
      )
      .where(eq(missionVolunteers.volunteerId, userId))
      .orderBy(desc(missionVolunteers.joinedAt))
      .limit(10);

    return rows.map((r) => ({
      id: r.id,
      missionId: r.missionId,
      reportId: r.reportId,
      reportTitle: r.reportTitle,
      reportStatus: r.reportStatus,
      volunteerStatus: r.volunteerStatus,
      joinedAt: r.joinedAt.toISOString(),
      releasedAt: r.releasedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Suspend an account. Blocks login and every authenticated request; changes
   * nothing else.
   *
   * WHAT THIS DELIBERATELY DOES NOT DO — and the reason the method is this
   * short. It does not close the user's open reports, does not release their
   * active volunteer slots, does not hide their comments and does not touch a
   * single row outside `user_account_status`. The owner's rule is "block login,
   * keep content visible", and the scenario that rule exists to protect is a
   * volunteer already on their way to help a reporter who then gets suspended:
   * that mission must continue and complete. Cascading anything from here would
   * strand them.
   *
   * Enforcement lives in exactly two places, both keyed on the CALLER's id:
   * auth.ts's session.create.before hook (login) and SuspendedAccountGuard
   * (requests). Neither ever looks at a report's reporter, so a volunteer's
   * requests are unaffected by construction rather than by a special case.
   */
  async suspend(
    admin: AdminIdentity,
    userId: string,
    dto: SuspendUserDto,
    meta?: AdminRequestMeta,
  ) {
    const target = await this.requireSuspendableUser(admin, userId);

    if (target.currentStatusKey === SUSPENDED_STATUS_KEY) {
      throw new ConflictException({
        code: 'USER_ALREADY_SUSPENDED',
        message: 'This account is already suspended.',
      });
    }

    const [suspendedStatus] = await db
      .select({ id: userStatuses.id })
      .from(userStatuses)
      .where(eq(userStatuses.key, SUSPENDED_STATUS_KEY));

    if (!suspendedStatus) {
      throw new Error(
        `user_statuses row missing for key "${SUSPENDED_STATUS_KEY}" — did db:seed run?`,
      );
    }

    const suspendedAt = new Date();

    await db.transaction(async (tx) => {
      // Upsert: absence of a row means active, so a first-ever suspension
      // inserts and a re-suspension updates the row a reactivate left behind.
      await tx
        .insert(userAccountStatus)
        .values({
          userId,
          statusId: suspendedStatus.id,
          reason: dto.reason,
          suspendedAt,
          suspendedBy: admin.userId,
        })
        .onConflictDoUpdate({
          target: userAccountStatus.userId,
          set: {
            statusId: suspendedStatus.id,
            reason: dto.reason,
            suspendedAt,
            suspendedBy: admin.userId,
            updatedAt: sql`now()`,
          },
        });

      // Same transaction as the mutation — an unattributable suspension is
      // exactly what the audit table exists to prevent.
      await this.auditService.record({
        admin,
        action: 'user.suspend',
        targetId: userId,
        targetLabel: target.name,
        before: { status: target.currentStatusKey },
        after: {
          status: SUSPENDED_STATUS_KEY,
          suspendedAt: suspendedAt.toISOString(),
        },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    // Sessions are deliberately NOT revoked. A suspended user keeps a resolvable
    // session so SuspendedAccountGuard can answer 403 ACCOUNT_SUSPENDED; delete
    // the session row instead and every call returns a bare 401, which the
    // mobile client cannot tell from an expired token — it would silently sign
    // them out and show a login screen rather than telling them what happened.
    // The session is inert either way; this way it is inert AND informative.
    return this.findOne(userId);
  }

  /** Lift a suspension. Reversible by design — see user-status-schema.ts. */
  async reactivate(
    admin: AdminIdentity,
    userId: string,
    dto: ReactivateUserDto,
    meta?: AdminRequestMeta,
  ) {
    const target = await this.requireSuspendableUser(admin, userId, {
      allowSelf: true,
      allowStaff: true,
    });

    if (target.currentStatusKey !== SUSPENDED_STATUS_KEY) {
      throw new ConflictException({
        code: 'USER_NOT_SUSPENDED',
        message: 'This account is not suspended.',
      });
    }

    const [activeStatus] = await db
      .select({ id: userStatuses.id })
      .from(userStatuses)
      .where(eq(userStatuses.key, ACTIVE_STATUS_KEY));

    if (!activeStatus) {
      throw new Error(
        `user_statuses row missing for key "${ACTIVE_STATUS_KEY}" — did db:seed run?`,
      );
    }

    await db.transaction(async (tx) => {
      // The row stays, flipped to active with the suspension fields cleared.
      // Keeping it costs nothing and makes "has this account ever been
      // actioned" answerable without reading the whole audit log.
      await tx
        .update(userAccountStatus)
        .set({
          statusId: activeStatus.id,
          reason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: sql`now()`,
        })
        .where(eq(userAccountStatus.userId, userId));

      await this.auditService.record({
        admin,
        action: 'user.reactivate',
        targetId: userId,
        targetLabel: target.name,
        before: {
          status: SUSPENDED_STATUS_KEY,
          reason: target.currentReason,
        },
        after: { status: ACTIVE_STATUS_KEY },
        reason: dto.reason ?? null,
        meta,
        tx,
      });
    });

    return this.findOne(userId);
  }

  /**
   * Shared preconditions.
   *
   * Staff cannot be suspended. Two reasons: an admin locked out of the console
   * cannot be let back in through the console, and revoking staff access is a
   * different operation entirely (removing the `admin_users` row), which this
   * endpoint must not become a confusing second way to do. Reactivation lifts
   * both restrictions — undoing a mistake must never be harder than making it.
   */
  private async requireSuspendableUser(
    admin: AdminIdentity,
    userId: string,
    options: { allowSelf?: boolean; allowStaff?: boolean } = {},
  ) {
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        currentStatusKey: this.statusKeySql,
        currentReason: userAccountStatus.reason,
        adminRoleKey: adminRoles.key,
      })
      .from(user)
      .leftJoin(userAccountStatus, eq(userAccountStatus.userId, user.id))
      .leftJoin(userStatuses, eq(userAccountStatus.statusId, userStatuses.id))
      .leftJoin(adminUsers, eq(adminUsers.userId, user.id))
      .leftJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .where(eq(user.id, userId));

    if (!row) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'No user with that id.',
      });
    }

    if (!options.allowSelf && row.id === admin.userId) {
      throw new ForbiddenException({
        code: 'CANNOT_SUSPEND_SELF',
        message: 'You cannot suspend your own account.',
      });
    }

    if (!options.allowStaff && row.adminRoleKey !== null) {
      throw new ForbiddenException({
        code: 'CANNOT_SUSPEND_ADMIN',
        message:
          'Staff accounts cannot be suspended. Revoke their admin role instead.',
      });
    }

    return row;
  }
}
