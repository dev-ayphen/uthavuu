import { BadRequestException, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { reportComments } from '../db/schema/comments-schema';
import { adminUsers } from '../db/schema/admin-schema';
import {
  adminAuditActions,
  adminAuditLogs,
  adminAuditTargetTypes,
} from '../db/schema/audit-schema';
import type { AdminIdentity } from './admin-rbac';
import type { ListActivityDto } from './dto/list-activity.dto';

/**
 * Dashboard -> Recent Activity. Read-only.
 *
 * ==========================================================================
 * MISSION CHAT IS NEVER IN THIS STREAM. `mission_messages` is not imported by
 * this file and must not be. ADR 0010.
 * ==========================================================================
 *
 * An activity feed is the single most likely place for that table to get
 * joined in "because it's activity too" — it sits in the same schema file as
 * `mission_volunteers` and `mission_completions`, both of which ARE in the
 * union below, and a private message genuinely looks like an event. It is not
 * one, for admins: Mission Chat is a security boundary
 * (CLAUDE.md § Known Gotchas), and `MissionsService.hasActiveAccess()` is the
 * only authority on who reads it. The spec asserts the absence by serialising
 * the whole payload, because the failure mode is a column somebody adds later.
 *
 * NOTHING HERE IS SYNTHESISED. Every item is one real row from one real table.
 * There is no "and 4 other people volunteered" roll-up, no placeholder, and no
 * event type without a table behind it — the console previously rendered
 * "Activity feed isn't wired to an endpoint yet" and the fix for that is real
 * rows, not plausible ones.
 *
 * NO AUDIT ENTRIES ARE WRITTEN. ADR 0012 scopes the audit log to mutations;
 * this endpoint has none.
 */

/** The six event kinds, one per source table. */
export const ACTIVITY_TYPES = [
  'report.created',
  'mission.accepted',
  'mission.completed',
  'comment.posted',
  'user.joined',
  'admin.action',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityItem {
  /** The source row's own id. Unique across the stream in practice; pair it with `type` for a render key. */
  id: string;
  type: ActivityType;
  /** ISO 8601. The stream is newest first. */
  occurredAt: string;

  /**
   * Who did it, or null when there is no name to show.
   *
   * `id` can be null while `name` is not: an `admin.action` snapshots the
   * actor's name at write time and `actor_user_id` is SET NULL on account
   * deletion, so a departed admin's entries stay readable. That is the same
   * shape AdminAuditService.list() returns.
   */
  actor: { id: string | null; name: string } | null;

  /**
   * The account is gone. DISTINCT FROM `actorAnonymous` and it must stay that
   * way — data.md invariant 3: "Deleted User" and "Posted anonymously" are
   * different facts and must never be conflated in any UI, admin included.
   */
  actorDeleted: boolean;

  /**
   * The reporter chose to post anonymously. Only ever true on `report.created`;
   * anonymity is a property of a report, not of a comment or a mission.
   *
   * When this is true the actor is null even though the account exists — the
   * name is withheld from this stream rather than the flag being trusted to
   * suppress it downstream. Note this is a deliberately TIGHTER projection than
   * AdminReportsService.reporterProjection(), which does reveal the identity to
   * staff behind an `anonymousToPublic` flag: that is a report's detail view,
   * reached on purpose, where an admin is investigating one row. This is a
   * glanceable stream on the landing page, and a name that scrolls past
   * somebody's shoulder is not an investigation.
   */
  actorAnonymous: boolean;

  /** What it happened to — a human-readable snapshot. */
  targetLabel: string | null;
  /** 'report' | 'comment' | 'user' | an audit target-type key. */
  targetType: string | null;
  targetId: string | null;

  /**
   * Extra qualifier, only populated for `admin.action` — the audit action's key
   * and label ('report.hide' / 'Hide report'). Without it every moderation entry
   * would read "an admin did something", which is not activity, it is noise.
   */
  detail: { key: string; label: string } | null;
}

export interface ActivityFeed {
  items: ActivityItem[];
  /** Absent on the last page. Opaque — echo it back as `?cursor=`. */
  nextCursor?: string;
  /**
   * Whether `admin.action` rows are in this stream.
   *
   * Returned rather than implied, because it is a PERMISSION fact, not a data
   * one: `GET /admin/audit-logs` is `platform:manage` (super admin only) by a
   * deliberate decision — "reading the trail of what every admin did is a
   * platform-administration capability". This endpoint is open to any admin, so
   * folding audit rows in unconditionally would hand ops admins the audit trail
   * through the side door. They are included only for callers who could already
   * read them, and the console is told which feed it is looking at instead of
   * silently showing a shorter one.
   */
  includesAdminActions: boolean;
}

/** How much of a comment body the feed shows. Enough to triage, not a reader. */
const COMMENT_SNIPPET_CHARS = 120;

type ActivityRow = {
  type: ActivityType;
  id: string;
  /**
   * TWO renderings of one instant, and the split is deliberate.
   *
   * `db.execute()` on a raw template hands back the driver's own string for a
   * timestamptz ('2026-09-02 08:20:27.576397+00') rather than a Date — drizzle's
   * column mapping only applies to its query builder. So the formatting happens
   * in SQL, where the precision can be chosen per purpose:
   *
   *   _iso  millisecond precision, spec-compliant ISO 8601. What the API returns.
   *         More than three fractional digits is implementation-defined in
   *         ECMAScript's Date parser, which is not a thing to put in a contract.
   *   _key  MICROsecond precision, cursor only, never serialised. Postgres stores
   *         microseconds; a cursor rounded to milliseconds would skip every row
   *         sitting inside the rounded-away microsecond — a silent dropped row at
   *         a page boundary, which is the exact failure keyset paging exists to
   *         avoid.
   */
  occurred_at_iso: string;
  occurred_at_key: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_deleted: boolean;
  actor_anonymous: boolean;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  detail_key: string | null;
  detail_label: string | null;
};

/**
 * The keyset the feed pages on.
 *
 * Three parts, not one. `occurredAt` alone is not unique — a report created and
 * its mission accepted can share a millisecond, and six tables merged together
 * make ties ordinary rather than exotic. `id` breaks almost all of them, and
 * `type` makes the key total even in the impossible case of two tables minting
 * the same id at the same instant. A cursor that is not a total order silently
 * drops or repeats rows at page boundaries, which is the bug this endpoint
 * exists to not have.
 */
interface ActivityCursor {
  /** The MICROsecond rendering (`occurred_at_key`), never the payload's. */
  occurredAt: string;
  id: string;
  type: string;
}

/**
 * Built from the ROW, not from the mapped item: the item carries the
 * millisecond rendering and the cursor needs the microsecond one.
 */
function encodeCursor(row: ActivityRow): string {
  const cursor: ActivityCursor = {
    occurredAt: row.occurred_at_key,
    id: row.id,
    type: row.type,
  };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Exactly the shape `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` emits.
 *
 * Strict on purpose. This string is interpolated into a `::timestamptz` cast, so
 * "anything Postgres might accept" is the wrong bar — a value that parses to a
 * different instant pages wrongly, and a value that fails to parse is a 500 out
 * of a malformed query parameter. Matching the exact format we issued means the
 * only strings that reach the database are ones this endpoint minted.
 */
const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

function decodeCursor(raw: string): ActivityCursor {
  // A malformed cursor is a 400, not a 500 and not a silent reset to page one.
  // Silently restarting would make a client bug look like an infinite feed.
  const invalid = new BadRequestException({
    code: 'ACTIVITY_INVALID_CURSOR',
    message: 'cursor is not a cursor this endpoint issued',
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid;
  }

  if (typeof parsed !== 'object' || parsed === null) throw invalid;
  const { occurredAt, id, type } = parsed as Record<string, unknown>;
  if (
    typeof occurredAt !== 'string' ||
    typeof id !== 'string' ||
    typeof type !== 'string' ||
    !CURSOR_TIMESTAMP.test(occurredAt)
  ) {
    throw invalid;
  }

  return { occurredAt, id, type };
}

@Injectable()
export class AdminActivityService {
  async list(
    query: ListActivityDto,
    admin: AdminIdentity,
  ): Promise<ActivityFeed> {
    const { limit } = query;
    const includesAdminActions = admin.permissions.includes('platform:manage');

    const branches: SQL[] = [
      this.reportsCreated(),
      this.missionsAccepted(),
      this.missionsCompleted(),
      this.commentsPosted(),
      this.usersJoined(),
    ];
    if (includesAdminActions) branches.push(this.adminActions());

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    // Row-value comparison, which is exactly the ORDER BY read as a tuple.
    // Writing it as `occurred_at < $1 or (occurred_at = $1 and ...)` by hand is
    // where off-by-one page boundaries come from.
    const cursorFilter = cursor
      ? sql`where (occurred_at, id, type) < (${cursor.occurredAt}::timestamptz, ${cursor.id}, ${cursor.type})`
      : sql``;

    // limit + 1: the extra row is how we know whether a next page exists,
    // without a second count query over the whole union.
    const rows = (await db.execute<ActivityRow>(sql`
      with activity as (
        ${sql.join(branches, sql` union all `)}
      )
      select
        type, id,
        actor_id, actor_name, actor_deleted, actor_anonymous,
        target_type, target_id, target_label,
        detail_key, detail_label,
        to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at_iso,
        to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as occurred_at_key
      from activity
      ${cursorFilter}
      order by occurred_at desc, id desc, type desc
      limit ${limit + 1}
    `)) as unknown as ActivityRow[];

    const page = rows.slice(0, limit);
    const items = page.map((row) => this.toItem(row));
    const hasMore = rows.length > limit;

    return {
      items,
      // Anchored to the last row actually returned, never to the peeked row —
      // the peeked row must appear at the TOP of the next page, not be skipped.
      ...(hasMore && page.length > 0
        ? { nextCursor: encodeCursor(page[page.length - 1]) }
        : {}),
      includesAdminActions,
    };
  }

  private toItem(row: ActivityRow): ActivityItem {
    return {
      id: row.id,
      type: row.type,
      occurredAt: row.occurred_at_iso,
      // Keyed on the NAME, not on the id: an admin.action carries a snapshotted
      // name with a null id, and an anonymous report carries an id the SQL has
      // already blanked the name for. "Is there a name to show" is the actual
      // question.
      actor:
        row.actor_name === null
          ? null
          : { id: row.actor_id, name: row.actor_name },
      actorDeleted: row.actor_deleted,
      actorAnonymous: row.actor_anonymous,
      targetLabel: row.target_label,
      targetType: row.target_type,
      targetId: row.target_id,
      detail:
        row.detail_key === null || row.detail_label === null
          ? null
          : { key: row.detail_key, label: row.detail_label },
    };
  }

  /**
   * Somebody asked for help.
   *
   * Soft-deleted reports are excluded (data.md invariant 1) — a removed report
   * must not reappear on the landing page of the console that removed it.
   *
   * The anonymity blanking happens HERE, in SQL, rather than in toItem(): the
   * name is never selected out of the database in the first place, so no later
   * projection change can leak it. Column aliases are declared on this branch
   * only — Postgres takes the whole UNION's column names from its first arm.
   */
  private reportsCreated(): SQL {
    return sql`
      select
        'report.created'::text                                            as type,
        ${reports.id}::text                                               as id,
        ${reports.createdAt}                                              as occurred_at,
        case when ${reports.anonymous} then null::text else ${reports.reporterId} end as actor_id,
        case when ${reports.anonymous} then null::text else ${user.name}   end as actor_name,
        (${reports.reporterId} is null)                                   as actor_deleted,
        ${reports.anonymous}                                              as actor_anonymous,
        'report'::text                                                    as target_type,
        ${reports.id}::text                                               as target_id,
        ${reports.title}                                                  as target_label,
        null::text                                                        as detail_key,
        null::text                                                        as detail_label
      from ${reports}
      left join ${user} on ${user.id} = ${reports.reporterId}
      where ${reports.deletedAt} is null
    `;
  }

  /**
   * Somebody volunteered.
   *
   * `mission_volunteers` has no `created_at` — `joined_at` IS the row's
   * creation stamp (missions-schema.ts), and it is the column BR-3's 15-minute
   * confirm deadline is measured from.
   *
   * Every volunteer row counts, including ones that later timed out or were
   * released. This is an event log: the moment somebody stepped forward
   * happened, whether or not they saw it through. Filtering on the current
   * status would also be wrong for a second reason — that status is evaluated
   * lazily on read (data.md invariant 5), so a raw filter on it is unreliable
   * anyway.
   */
  private missionsAccepted(): SQL {
    return sql`
      select
        'mission.accepted'::text,
        ${missionVolunteers.id}::text,
        ${missionVolunteers.joinedAt},
        ${missionVolunteers.volunteerId},
        ${user.name},
        (${missionVolunteers.volunteerId} is null),
        false,
        'report'::text,
        ${reports.id}::text,
        ${reports.title},
        null::text,
        null::text
      from ${missionVolunteers}
      inner join ${missions} on ${missions.id} = ${missionVolunteers.missionId}
      inner join ${reports} on ${reports.id} = ${missions.reportId}
      left join ${user} on ${user.id} = ${missionVolunteers.volunteerId}
      where ${reports.deletedAt} is null
    `;
  }

  /**
   * Somebody finished. Keyed on `submitted_at` for the same reason the
   * dashboard's completedToday is: it stays meaningful if verification ever
   * becomes asynchronous (mission-completion.md BR-4).
   *
   * The target is the REPORT, not the completion, because that is where an
   * admin clicking the row needs to land.
   */
  private missionsCompleted(): SQL {
    return sql`
      select
        'mission.completed'::text,
        ${missionCompletions.id}::text,
        ${missionCompletions.submittedAt},
        ${missionCompletions.completedById},
        ${user.name},
        (${missionCompletions.completedById} is null),
        false,
        'report'::text,
        ${reports.id}::text,
        ${reports.title},
        null::text,
        null::text
      from ${missionCompletions}
      inner join ${missions} on ${missions.id} = ${missionCompletions.missionId}
      inner join ${reports} on ${reports.id} = ${missions.reportId}
      left join ${user} on ${user.id} = ${missionCompletions.completedById}
      where ${reports.deletedAt} is null
    `;
  }

  /**
   * A Community Update — `report_comments`, the per-report public feed
   * (ADR 0013), not Announcements.
   *
   * Two soft-delete filters, both load-bearing. A moderator-removed comment is
   * gone from the public thread, so leaving it here would put the body a
   * moderator just took down back on the console's landing page. And a comment
   * on a soft-deleted report inherits that report's removal.
   */
  private commentsPosted(): SQL {
    return sql`
      select
        'comment.posted'::text,
        ${reportComments.id}::text,
        ${reportComments.createdAt},
        ${reportComments.authorId},
        ${user.name},
        (${reportComments.authorId} is null),
        false,
        'comment'::text,
        ${reportComments.id}::text,
        left(${reportComments.body}, ${COMMENT_SNIPPET_CHARS}::int),
        null::text,
        null::text
      from ${reportComments}
      inner join ${reports} on ${reports.id} = ${reportComments.reportId}
      left join ${user} on ${user.id} = ${reportComments.authorId}
      where ${reportComments.deletedAt} is null and ${reports.deletedAt} is null
    `;
  }

  /**
   * Somebody signed up. Staff are excluded, the same way and for the same
   * reason the dashboard's totalUsers excludes them: seeding console logins is
   * not community activity, and what staff actually DO already arrives as
   * `admin.action`.
   *
   * `user.created_at` is `timestamp` WITHOUT time zone (Better Auth owns that
   * column) while every other branch is `timestamptz`. `AT TIME ZONE 'UTC'`
   * reads it as the UTC wall clock Better Auth wrote, which is what makes the
   * UNION type-check AND puts the event at the right instant. Without the cast
   * Postgres refuses the union outright — the failure is loud, which is lucky,
   * because a silent one would misplace every signup by the server's offset.
   */
  private usersJoined(): SQL {
    return sql`
      select
        'user.joined'::text,
        ${user.id}::text,
        (${user.createdAt} at time zone 'UTC'),
        ${user.id},
        ${user.name},
        false,
        false,
        'user'::text,
        ${user.id}::text,
        ${user.name},
        null::text,
        null::text
      from ${user}
      where not exists (
        select 1 from ${adminUsers} where ${adminUsers.userId} = ${user.id}
      )
    `;
  }

  /**
   * A moderator acted. Only reachable by `platform:manage` — see
   * `ActivityFeed.includesAdminActions`.
   *
   * Deliberately NOT filtered by the target's current state. An entry reading
   * "hid report X" is precisely the row that should survive X being hidden;
   * suppressing it would make the trail thinnest exactly where it matters, and
   * `target_id` is text with no FK (ADR 0012) so there is nothing to join to
   * anyway. `target_label` is the snapshot taken at write time.
   *
   * The actor is read from the snapshot columns, NOT joined back to `user`.
   * `actor_user_id` is SET NULL on account deletion, so a join would return
   * nothing for a departed admin — which is exactly why ADR 0012 put
   * `actor_name` on the row in the first place.
   */
  private adminActions(): SQL {
    return sql`
      select
        'admin.action'::text,
        ${adminAuditLogs.id}::text,
        ${adminAuditLogs.createdAt},
        ${adminAuditLogs.actorUserId},
        ${adminAuditLogs.actorName},
        (${adminAuditLogs.actorUserId} is null),
        false,
        ${adminAuditTargetTypes.key},
        ${adminAuditLogs.targetId},
        ${adminAuditLogs.targetLabel},
        ${adminAuditActions.key},
        ${adminAuditActions.label}
      from ${adminAuditLogs}
      inner join ${adminAuditActions} on ${adminAuditActions.id} = ${adminAuditLogs.actionId}
      inner join ${adminAuditTargetTypes} on ${adminAuditTargetTypes.id} = ${adminAuditLogs.targetTypeId}
    `;
  }
}
