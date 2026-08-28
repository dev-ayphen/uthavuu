// Admin RBAC master data + the two seeded console accounts.
//
// Kept out of seed.ts because it is the only part of the seed that touches
// Better Auth: it needs the running `auth` instance to hash passwords with the
// exact algorithm `/api/auth/sign-in/email` will verify them with. seed.ts
// imports and calls this; the split keeps that dependency in one file.
import { uuidv7 } from 'uuidv7';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { createLocalAccountIssuer } from 'better-auth';
import { db } from './index';
import { account, user } from './schema/auth-schema';
import {
  adminPermissions,
  adminRolePermissions,
  adminRoles,
  adminUsers,
} from './schema/admin-schema';
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  ADMIN_ROLE_PERMISSIONS,
} from '../admin/admin-rbac';
import { assertProductionSafe, resolveAdminSpecs } from './admin-seed-policy';
import { auth } from '../auth/auth';

export async function seedAdmins(): Promise<{
  roles: number;
  permissions: number;
  admins: number;
}> {
  // 1. Roles and permissions — lookup tables, upserted by `key` exactly like
  //    every other lookup table in seed.ts.
  for (const role of ADMIN_ROLES) {
    await db
      .insert(adminRoles)
      .values({ id: uuidv7(), ...role })
      .onConflictDoUpdate({
        target: adminRoles.key,
        set: { label: role.label, updatedAt: sql`now()` },
      });
  }

  for (const permission of ADMIN_PERMISSIONS) {
    await db
      .insert(adminPermissions)
      .values({ id: uuidv7(), key: permission.key, label: permission.label })
      .onConflictDoUpdate({
        target: adminPermissions.key,
        set: { label: permission.label, updatedAt: sql`now()` },
      });
  }

  const roleRows = await db.select().from(adminRoles);
  const permissionRows = await db.select().from(adminPermissions);
  const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  // 2. The role -> permission grants.
  for (const [roleKey, permissionKeys] of Object.entries(
    ADMIN_ROLE_PERMISSIONS,
  )) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) throw new Error(`admin role '${roleKey}' was not seeded`);

    for (const permissionKey of permissionKeys) {
      const permissionId = permissionIdByKey.get(permissionKey);
      if (!permissionId)
        throw new Error(`admin permission '${permissionKey}' was not seeded`);

      await db
        .insert(adminRolePermissions)
        .values({ id: uuidv7(), roleId, permissionId })
        .onConflictDoNothing({
          target: [
            adminRolePermissions.roleId,
            adminRolePermissions.permissionId,
          ],
        });
    }

    // Revocations must actually revoke. Without this, removing a permission from
    // ADMIN_ROLE_PERMISSIONS would leave the old grant row in place and the
    // guard would keep honouring it — a seed that can only ever widen access.
    const intendedIds = permissionKeys
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id));
    if (intendedIds.length > 0) {
      await db
        .delete(adminRolePermissions)
        .where(
          and(
            eq(adminRolePermissions.roleId, roleId),
            notInArray(adminRolePermissions.permissionId, intendedIds),
          ),
        );
    }
  }

  // 3. The two console accounts.
  const specs = resolveAdminSpecs();
  assertProductionSafe(specs);

  // Better Auth's own hasher (scrypt by default), reached through the live auth
  // instance so it always matches whatever /api/auth/sign-in/email verifies
  // with. No password is ever written anywhere in plaintext, and this file never
  // implements its own crypto.
  const authContext = await auth.$context;
  const credentialIssuer = createLocalAccountIssuer('credential');
  const forceReset = process.env.SEED_ADMIN_FORCE_PASSWORD_RESET === 'true';

  for (const spec of specs) {
    const roleId = roleIdByKey.get(spec.roleKey);
    if (!roleId) throw new Error(`admin role '${spec.roleKey}' was not seeded`);

    const [existing] = await db
      .select()
      .from(user)
      .where(eq(user.email, spec.email));

    const userId = existing?.id ?? uuidv7();
    if (!existing) {
      await db.insert(user).values({
        id: userId,
        name: spec.name,
        email: spec.email,
        // No verification email can be sent — this project has no email provider
        // (docs/decisions/0003-no-email-provider-at-launch.md). A seeded staff
        // account is verified by virtue of an operator having provisioned it.
        emailVerified: true,
        // Deliberately no phoneNumber: an admin account is not a citizen account.
        // It cannot be signed into from the mobile app, because mobile only
        // authenticates by phone + OTP and there is no number to send one to.
        profileCompletedAt: new Date(),
      });
    }

    const [existingCredential] = await db
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, 'credential')),
      );

    if (!existingCredential) {
      await db.insert(account).values({
        id: uuidv7(),
        userId,
        providerId: 'credential',
        // Better Auth 1.7 looks the credential account up by
        // (issuer, accountId, providerId) — see sign-in.mjs's credentialAccount
        // lookup. accountId is the user's own id for local credentials.
        issuer: credentialIssuer,
        accountId: userId,
        password: await authContext.password.hash(spec.password),
        updatedAt: new Date(),
      });
    } else if (forceReset) {
      // Opt-in, never automatic. A seed that silently rewrote the password on
      // every run would undo any rotation an operator did outside it — and this
      // seed runs on container start (apps/api/Dockerfile's CMD).
      await db
        .update(account)
        .set({
          password: await authContext.password.hash(spec.password),
          updatedAt: new Date(),
        })
        .where(eq(account.id, existingCredential.id));
    }

    await db
      .insert(adminUsers)
      .values({ userId, roleId })
      .onConflictDoUpdate({
        target: adminUsers.userId,
        set: { roleId, updatedAt: sql`now()` },
      });
  }

  if (specs.some((s) => s.usingDevDefault)) {
    console.warn(
      '[seed] Admin accounts are using DEVELOPMENT DEFAULT passwords. Set SEED_ADMIN_PASSWORD / SEED_OPS_PASSWORD before any real deployment.',
    );
  }
  if (!forceReset) {
    console.log(
      '[seed] Existing admin passwords left untouched. Set SEED_ADMIN_FORCE_PASSWORD_RESET=true to rotate them to the env values.',
    );
  }

  return {
    roles: ADMIN_ROLES.length,
    permissions: ADMIN_PERMISSIONS.length,
    admins: specs.length,
  };
}
