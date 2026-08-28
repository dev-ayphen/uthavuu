import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  adminPermissions,
  adminRolePermissions,
  adminRoles,
  adminUsers,
} from '../db/schema/admin-schema';
import type { AdminIdentity } from './admin-rbac';

@Injectable()
export class AdminService {
  /**
   * Resolve a signed-in user id to their admin identity, or null if they are not
   * an admin.
   *
   * Null is the answer for every ordinary citizen, and it is the answer the
   * guard turns into a 403 — so "not in admin_users" and "no access" are the
   * same fact, expressed once.
   *
   * Read fresh from the database on every admin request, deliberately not
   * cached. Admin traffic is a handful of staff at a desk, so the join costs
   * nothing; and a revoked role that stays live for a five-minute cache TTL is
   * a worse trade than a query per request.
   */
  async findAdminIdentity(userId: string): Promise<AdminIdentity | null> {
    const [row] = await db
      .select({
        userId: adminUsers.userId,
        name: user.name,
        email: user.email,
        roleId: adminRoles.id,
        roleKey: adminRoles.key,
        roleLabel: adminRoles.label,
      })
      .from(adminUsers)
      .innerJoin(user, eq(adminUsers.userId, user.id))
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .where(eq(adminUsers.userId, userId));

    if (!row) return null;

    const permissionRows = await db
      .select({ key: adminPermissions.key })
      .from(adminRolePermissions)
      .innerJoin(
        adminPermissions,
        eq(adminRolePermissions.permissionId, adminPermissions.id),
      )
      .where(eq(adminRolePermissions.roleId, row.roleId))
      .orderBy(asc(adminPermissions.key));

    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: { key: row.roleKey, label: row.roleLabel },
      permissions: permissionRows.map((p) => p.key),
    };
  }

  /**
   * The console's Admins tab (docs/webadmin/09-admins-and-audit.md). Gated on
   * `platform:manage` at the route, which is the server-side fix for that
   * document's gap #2 — in the prototype an Ops Moderator, or an unauthenticated
   * visitor, could open this tab and create a Super Admin.
   *
   * Returns no credential material: there is nothing password-shaped on `user`
   * to leak (hashes live on `account`), and this query never touches that table.
   */
  async listAdmins() {
    const rows = await db
      .select({
        userId: adminUsers.userId,
        name: user.name,
        email: user.email,
        roleKey: adminRoles.key,
        roleLabel: adminRoles.label,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .innerJoin(user, eq(adminUsers.userId, user.id))
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .orderBy(asc(adminRoles.key), asc(user.email));

    return rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: { key: row.roleKey, label: row.roleLabel },
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
