import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  adminAuditActions,
  adminAuditLogs,
  adminAuditTargetTypes,
} from '../db/schema/audit-schema';
import type { AdminAuditAction } from './admin-audit-catalogue';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import type { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { offsetFor, paginate } from './admin-pagination';

/**
 * A Drizzle executor: either the `db` singleton or a transaction handle.
 *
 * This type is the whole reason `record()` is usable correctly. An audit entry
 * written outside the transaction that made the change can be orphaned by a
 * rollback (a log of something that never happened) or lost by a crash between
 * the two statements (a change nobody can attribute). Both are exactly the
 * failure docs/webadmin/09-admins-and-audit.md is complaining about, arrived at
 * a different way. Callers pass their `tx` and get atomicity for free.
 */
export type Executor = Pick<typeof db, 'insert' | 'select' | 'update'>;

export interface RecordAuditParams {
  /** Resolved by AdminGuard, so it cannot be spoofed by the request. */
  admin: AdminIdentity;
  action: AdminAuditAction;
  targetId?: string | null;
  /** Human-readable snapshot — a report title, a category key. */
  targetLabel?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  meta?: AdminRequestMeta;
  /** Pass the transaction that performs the mutation. See Executor. */
  tx?: Executor;
}

@Injectable()
export class AdminAuditService {
  /**
   * Master data is immutable between deploys (adding an action is a code change
   * to admin-audit-catalogue.ts plus a `db:seed`), so resolving key -> id once
   * per process is safe. A miss always falls through to a query, so a row seeded
   * after boot is still picked up on first use — the memo can be stale-empty,
   * never stale-wrong.
   */
  private readonly actionIds = new Map<string, string>();
  private readonly targetTypeIds = new Map<string, string>();

  async record(params: RecordAuditParams): Promise<void> {
    const {
      admin,
      action,
      targetId = null,
      targetLabel = null,
      before,
      after,
      reason = null,
      meta,
      tx = db,
    } = params;

    const actionId = await this.actionIdFor(action);
    const targetTypeId = await this.targetTypeIdFor(action);

    await tx.insert(adminAuditLogs).values({
      id: uuidv7(),
      actorUserId: admin.userId,
      // Snapshots, not joins — see the actor_* columns in db/schema/audit-schema.ts.
      actorEmail: admin.email,
      actorName: admin.name,
      actorRoleKey: admin.role.key,
      actionId,
      targetTypeId,
      targetId,
      targetLabel,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
      reason,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });
  }

  private async actionIdFor(key: AdminAuditAction): Promise<string> {
    const memo = this.actionIds.get(key);
    if (memo) return memo;

    const [row] = await db
      .select({ id: adminAuditActions.id })
      .from(adminAuditActions)
      .where(eq(adminAuditActions.key, key));

    // Loud, not silent. An action in the catalogue but not in the database means
    // db:seed has not run since it was added; writing the mutation without its
    // audit row would be the exact failure this table exists to prevent, so the
    // whole request fails instead.
    if (!row) {
      throw new Error(
        `admin_audit_actions row missing for key "${key}" — did db:seed run?`,
      );
    }

    this.actionIds.set(key, row.id);
    return row.id;
  }

  private async targetTypeIdFor(action: AdminAuditAction): Promise<string> {
    const [actionRow] = await db
      .select({ targetTypeKey: adminAuditActions.targetTypeKey })
      .from(adminAuditActions)
      .where(eq(adminAuditActions.key, action));

    if (!actionRow) {
      throw new Error(
        `admin_audit_actions row missing for key "${action}" — did db:seed run?`,
      );
    }

    const memo = this.targetTypeIds.get(actionRow.targetTypeKey);
    if (memo) return memo;

    const [row] = await db
      .select({ id: adminAuditTargetTypes.id })
      .from(adminAuditTargetTypes)
      .where(eq(adminAuditTargetTypes.key, actionRow.targetTypeKey));

    if (!row) {
      throw new Error(
        `admin_audit_target_types row missing for key "${actionRow.targetTypeKey}" — did db:seed run?`,
      );
    }

    this.targetTypeIds.set(actionRow.targetTypeKey, row.id);
    return row.id;
  }

  /** Platform -> Audit logs. */
  async list(query: ListAuditLogsDto) {
    const filters = [
      query.actorUserId
        ? eq(adminAuditLogs.actorUserId, query.actorUserId)
        : undefined,
      query.action ? eq(adminAuditActions.key, query.action) : undefined,
      query.targetType
        ? eq(adminAuditTargetTypes.key, query.targetType)
        : undefined,
      query.targetId ? eq(adminAuditLogs.targetId, query.targetId) : undefined,
      query.from ? gte(adminAuditLogs.createdAt, query.from) : undefined,
      query.to ? lte(adminAuditLogs.createdAt, query.to) : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: adminAuditLogs.id,
          actorUserId: adminAuditLogs.actorUserId,
          actorEmail: adminAuditLogs.actorEmail,
          actorName: adminAuditLogs.actorName,
          actorRoleKey: adminAuditLogs.actorRoleKey,
          actionKey: adminAuditActions.key,
          actionLabel: adminAuditActions.label,
          targetTypeKey: adminAuditTargetTypes.key,
          targetTypeLabel: adminAuditTargetTypes.label,
          targetId: adminAuditLogs.targetId,
          targetLabel: adminAuditLogs.targetLabel,
          before: adminAuditLogs.before,
          after: adminAuditLogs.after,
          reason: adminAuditLogs.reason,
          ipAddress: adminAuditLogs.ipAddress,
          userAgent: adminAuditLogs.userAgent,
          createdAt: adminAuditLogs.createdAt,
          // Whether the acting admin's account still exists. The snapshot
          // columns keep the row readable either way; this tells the console
          // whether "Super Admin" is a live person it can link to.
          actorExists: sql<boolean>`${user.id} is not null`,
        })
        .from(adminAuditLogs)
        .innerJoin(
          adminAuditActions,
          eq(adminAuditLogs.actionId, adminAuditActions.id),
        )
        .innerJoin(
          adminAuditTargetTypes,
          eq(adminAuditLogs.targetTypeId, adminAuditTargetTypes.id),
        )
        // leftJoin: actor_user_id is SET NULL, so a departed admin's entries
        // must still be listed. innerJoin here would hide exactly the rows most
        // worth keeping.
        .leftJoin(user, eq(adminAuditLogs.actorUserId, user.id))
        .where(where)
        // uuidv7 ids are time-ordered, so id desc breaks ties in true write
        // order — two actions inside one transaction share a createdAt.
        .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      db
        .select({ count: sql<string>`count(*)` })
        .from(adminAuditLogs)
        .innerJoin(
          adminAuditActions,
          eq(adminAuditLogs.actionId, adminAuditActions.id),
        )
        .innerJoin(
          adminAuditTargetTypes,
          eq(adminAuditLogs.targetTypeId, adminAuditTargetTypes.id),
        )
        .where(where),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        actor: {
          userId: row.actorUserId,
          name: row.actorName,
          email: row.actorEmail,
          roleKey: row.actorRoleKey,
          accountExists: row.actorExists,
        },
        action: { key: row.actionKey, label: row.actionLabel },
        target: {
          type: { key: row.targetTypeKey, label: row.targetTypeLabel },
          id: row.targetId,
          label: row.targetLabel,
        },
        before: row.before,
        after: row.after,
        reason: row.reason,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  /**
   * The filter dropdowns' options. Served from the lookup tables rather than
   * `select distinct` over the log, which is the whole reason those tables
   * exist — see db/schema/audit-schema.ts.
   */
  async catalogue() {
    const [actions, targetTypes] = await Promise.all([
      db
        .select({
          key: adminAuditActions.key,
          label: adminAuditActions.label,
          targetTypeKey: adminAuditActions.targetTypeKey,
        })
        .from(adminAuditActions)
        .orderBy(asc(adminAuditActions.sortOrder), asc(adminAuditActions.key)),
      db
        .select({
          key: adminAuditTargetTypes.key,
          label: adminAuditTargetTypes.label,
        })
        .from(adminAuditTargetTypes)
        .orderBy(
          asc(adminAuditTargetTypes.sortOrder),
          asc(adminAuditTargetTypes.key),
        ),
    ]);

    return { actions, targetTypes };
  }
}
