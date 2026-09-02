import 'dotenv/config';
import { uuidv7 } from 'uuidv7';

/**
 * Platform -> Admins: the console managing its own operators.
 *
 * Three things make this suite worth more than its length. Each is a failure
 * that no other test in the repo would catch:
 *
 *  1. THE LOCKOUT. Suspending, revoking or demoting the last Super Admin leaves
 *     a console nobody can sign into, with no password-reset email (ADR 0003)
 *     and no self-service path back in. Recovery means hand-editing the
 *     production database. The rule is enforced in the service; these tests are
 *     what stop it being refactored away by someone who reads it as defensive
 *     noise.
 *  2. THE SELF-INFLICTED VERSION of the same thing, which is the likelier one.
 *  3. PASSWORDS. Every write goes through Better Auth's hasher, and no
 *     plaintext, hash or length may reach a response or an audit row. The
 *     sweep at the bottom asserts that against the whole database rather than
 *     against the one column somebody remembered.
 *
 * Own throwaway database, per admin/testing/admin-spec-db.ts: the factory is
 * hoisted above every import, so it cannot close over anything and the name has
 * to be a literal.
 */
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_accounts_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '../db';
import { account, session, user } from '../db/schema/auth-schema';
import { adminRoles, adminUsers } from '../db/schema/admin-schema';
import { userAccountStatus } from '../db/schema/user-status-schema';
import { adminAuditActions, adminAuditLogs } from '../db/schema/audit-schema';
import { reports } from '../db/schema/reports-schema';
import { isUserSuspended } from '../account-status/account-status';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuditService } from './admin-audit.service';
import type { AdminCredentials } from './admin-credentials';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_accounts_test';
const HOUR = 60 * 60 * 1000;

/**
 * A stand-in for Better Auth's hasher, and the reason AdminCredentials is an
 * interface at all (see admin-credentials.ts — the real one is ESM-only and
 * unloadable under this repo's CommonJS Jest transform).
 *
 * `hashed:` is a deliberately obvious marker: every assertion below that a
 * password was hashed is really the assertion that the STORED value is this
 * function's output and never the plaintext the caller sent. Verifying by
 * reconstructing the marker means a service that stored the plaintext, or
 * stored nothing, fails rather than passes by accident.
 */
function fakeCredentials() {
  // The two mocks are returned ALONGSIDE the object rather than being read back
  // off it. `AdminCredentials` declares `hash`/`verify` with method syntax, so
  // `expect(credentials.hash)` detaches a method from its receiver and trips
  // @typescript-eslint/unbound-method. Handing back the jest.fn()s directly
  // means the assertions never reach through the interface at all.
  const hash = jest.fn((password: string) =>
    Promise.resolve(`hashed:${password}`),
  );
  const verify = jest.fn(
    ({ hash: stored, password }: { hash: string; password: string }) =>
      Promise.resolve(stored === `hashed:${password}`),
  );
  const issuer = jest.fn(() => Promise.resolve('local:credential'));

  const credentials: AdminCredentials = { hash, verify, issuer };
  return { credentials, hash, verify };
}

describe('Admin account management', () => {
  const auditService = new AdminAuditService();
  let hashMock: ReturnType<typeof fakeCredentials>['hash'];
  let verifyMock: ReturnType<typeof fakeCredentials>['verify'];
  let service: AdminAccountsService;

  let lookups: Awaited<ReturnType<typeof seedLookups>>;

  // Two Super Admins and one Ops Admin, so "the last Super Admin" can be
  // arranged and un-arranged rather than being the fixture's permanent state.
  const superAId = uuidv7();
  const superBId = uuidv7();
  const opsId = uuidv7();
  const citizenId = uuidv7();
  const FIXTURE_USER_IDS = [superAId, superBId, opsId, citizenId];

  /** Acting as Super A. Used wherever the actor must not be the target. */
  const asSuperA = fakeAdmin({
    userId: superAId,
    name: 'Super A',
    email: 'super-a@uthavu.org',
  });

  /**
   * Acting as the Ops Admin. Used only where the actor has to be somebody who
   * is NOT one of the Super Admins being counted — the service does not check
   * permissions (AdminGuard does, and admin.guard.spec.ts covers it), so this
   * is about arranging the roster, not about privilege.
   */
  const asOps = fakeAdmin({
    userId: opsId,
    name: 'Ops Admin',
    email: 'ops@uthavu.org',
    roleKey: 'ops_admin',
    roleLabel: 'Ops Admin',
  });

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      { id: superAId, name: 'Super A', email: 'super-a@uthavu.org' },
      { id: superBId, name: 'Super B', email: 'super-b@uthavu.org' },
      { id: opsId, name: 'Ops Admin', email: 'ops@uthavu.org' },
      {
        id: citizenId,
        name: 'Priya K',
        email: 'priya@test.local',
        phoneNumber: '+919000000009',
      },
    ]);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  /**
   * Rebuilt rather than cleaned up: these tests delete admin rows, change
   * roles and create accounts, so restoring a known roster is cheaper to reason
   * about than undoing whatever the previous test did.
   */
  beforeEach(async () => {
    const fake = fakeCredentials();
    hashMock = fake.hash;
    verifyMock = fake.verify;
    service = new AdminAccountsService(auditService, fake.credentials);

    await db.delete(adminAuditLogs);
    await db.delete(userAccountStatus);
    await db.delete(session);
    await db.delete(account);
    await db.delete(adminUsers);
    await db.delete(reports);
    await db.delete(user).where(notInArray(user.id, FIXTURE_USER_IDS));

    // `name` and `email` are mutable columns that the PATCH tests change, so
    // they get restored too. Without this the fixture drifts and a later test
    // asserting on 'Super B' passes or fails depending on what ran before it.
    for (const [id, name, email] of [
      [superAId, 'Super A', 'super-a@uthavu.org'],
      [superBId, 'Super B', 'super-b@uthavu.org'],
      [opsId, 'Ops Admin', 'ops@uthavu.org'],
    ] as const) {
      await db.update(user).set({ name, email }).where(eq(user.id, id));
    }

    await db.insert(adminUsers).values([
      { userId: superAId, roleId: lookups.adminRoleIds.super_admin },
      { userId: superBId, roleId: lookups.adminRoleIds.super_admin },
      { userId: opsId, roleId: lookups.adminRoleIds.ops_admin },
    ]);

    await db.insert(account).values(
      [superAId, superBId, opsId].map((userId) => ({
        id: uuidv7(),
        userId,
        providerId: 'credential',
        issuer: 'local:credential',
        accountId: userId,
        password: 'hashed:original-password',
        updatedAt: new Date(),
      })),
    );
  });

  /** Everything the audit log currently holds, action key included. */
  async function auditRows() {
    return db
      .select({
        actionKey: adminAuditActions.key,
        actorUserId: adminAuditLogs.actorUserId,
        targetId: adminAuditLogs.targetId,
        targetLabel: adminAuditLogs.targetLabel,
        before: adminAuditLogs.before,
        after: adminAuditLogs.after,
        reason: adminAuditLogs.reason,
      })
      .from(adminAuditLogs)
      .innerJoin(
        adminAuditActions,
        eq(adminAuditLogs.actionId, adminAuditActions.id),
      );
  }

  async function passwordOf(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ password: account.password })
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, 'credential')),
      );
    return row?.password ?? null;
  }

  async function roleKeyOf(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ key: adminRoles.key })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .where(eq(adminUsers.userId, userId));
    return row?.key ?? null;
  }

  /** Leave exactly one Super Admin able to sign in: Super A. */
  async function makeSuperBSuspended(): Promise<void> {
    await db.insert(userAccountStatus).values({
      userId: superBId,
      statusId: lookups.userStatusIds.suspended,
      reason: 'On extended leave',
      suspendedAt: new Date(),
      suspendedBy: superAId,
    });
  }

  /** Leave exactly one Super Admin at all: Super A. */
  async function removeSuperB(): Promise<void> {
    await db.delete(adminUsers).where(eq(adminUsers.userId, superBId));
  }

  // ────────────────────────────────────────────────────────────────────────
  // GET /admin/admins/:id
  // ────────────────────────────────────────────────────────────────────────

  describe('the detail projection', () => {
    it('reports role, status, grant date and the two UI flags', async () => {
      const detail = await service.findOne(asSuperA, superBId);

      expect(detail).toMatchObject({
        userId: superBId,
        name: 'Super B',
        email: 'super-b@uthavu.org',
        role: { key: 'super_admin', label: 'Super Admin' },
        status: { key: 'active', label: 'Active' },
        isSelf: false,
        // Two sign-in-capable Super Admins exist, so neither is the last one.
        isLastSuperAdmin: false,
      });
      expect(typeof detail.createdAt).toBe('string');
    });

    it('marks the caller as isSelf', async () => {
      const detail = await service.findOne(asSuperA, superAId);
      expect(detail.isSelf).toBe(true);
    });

    it('flags the last sign-in-capable Super Admin so the console can disable the buttons', async () => {
      await removeSuperB();

      const detail = await service.findOne(asOps, superAId);
      expect(detail.isLastSuperAdmin).toBe(true);

      // ...and an Ops Admin is never "the last Super Admin", whatever the count.
      const ops = await service.findOne(asSuperA, opsId);
      expect(ops.isLastSuperAdmin).toBe(false);
    });

    it('does not count a SUSPENDED Super Admin as a spare', async () => {
      // The subtle one. Two admin_users rows say super_admin, but only one of
      // those people can actually get in — so Super A is still the last way
      // into the console, and the flag has to say so.
      await makeSuperBSuspended();

      const detail = await service.findOne(asOps, superAId);
      expect(detail.isLastSuperAdmin).toBe(true);
    });

    it('derives lastLoginAt from the most recent session, and null when there is none', async () => {
      const never = await service.findOne(asSuperA, superBId);
      expect(never.lastLoginAt).toBeNull();

      const older = new Date(Date.now() - 3 * HOUR);
      const newest = new Date(Date.now() - 1 * HOUR);
      await db.insert(session).values([
        {
          id: uuidv7(),
          userId: superBId,
          token: uuidv7(),
          createdAt: older,
          updatedAt: older,
          expiresAt: new Date(Date.now() + HOUR),
        },
        {
          id: uuidv7(),
          userId: superBId,
          token: uuidv7(),
          createdAt: newest,
          updatedAt: newest,
          expiresAt: new Date(Date.now() + HOUR),
        },
      ]);

      const after = await service.findOne(asSuperA, superBId);
      expect(after.lastLoginAt).toBe(newest.toISOString());
    });

    it('404s for a real citizen — "not an admin" and "no such admin" are one fact here', async () => {
      await expect(service.findOne(asSuperA, citizenId)).rejects.toMatchObject({
        response: { code: 'ADMIN_NOT_FOUND' },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /admin/admins
  // ────────────────────────────────────────────────────────────────────────

  describe('the roster listing', () => {
    it('returns the SAME shape as the detail route, for every admin', async () => {
      // The bug this asserts against is specific: the list used to come from a
      // different query and omitted `status`, so the console's row menu could
      // not know whether to offer Suspend or Reactivate — and defaulting to one
      // meant the other was unreachable from the table.
      const list = await service.list(asSuperA);
      const detail = await service.findOne(asSuperA, superBId);
      const row = list.find((a) => a.userId === superBId);

      expect(row).toEqual(detail);
      expect(Object.keys(row!).sort()).toEqual(Object.keys(detail).sort());
    });

    it('carries status, lastLoginAt and the flags on every row', async () => {
      await service.suspend(asSuperA, superBId, { reason: 'Under review' });

      const list = await service.list(asSuperA);

      expect(list.map((a) => a.userId).sort()).toEqual(
        [superAId, superBId, opsId].sort(),
      );
      expect(list.find((a) => a.userId === superBId)!.status.key).toBe(
        'suspended',
      );
      expect(list.find((a) => a.userId === superAId)).toMatchObject({
        isSelf: true,
        // Super B is suspended, so Super A is the last way into the console.
        isLastSuperAdmin: true,
      });
      expect(
        list.every((a) =>
          Object.prototype.hasOwnProperty.call(a, 'lastLoginAt'),
        ),
      ).toBe(true);
    });

    it('lists admins only, and no credential material', async () => {
      const list = await service.list(asSuperA);

      expect(list.some((a) => a.userId === citizenId)).toBe(false);
      expect(list.every((a) => !('password' in a))).toBe(true);
    });

    it('drops a revoked admin from the roster while leaving the person alone', async () => {
      await service.revoke(asSuperA, opsId);

      const list = await service.list(asSuperA);
      expect(list.some((a) => a.userId === opsId)).toBe(false);

      const [stillAUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, opsId));
      expect(stillAUser).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // PATCH /admin/me
  // ────────────────────────────────────────────────────────────────────────

  describe('editing your own profile', () => {
    it('lets any admin change their own name and email', async () => {
      const detail = await service.updateMyProfile(asOps, {
        name: 'Ops Lead',
        email: 'ops.lead@uthavu.org',
      });

      expect(detail).toMatchObject({
        userId: opsId,
        name: 'Ops Lead',
        email: 'ops.lead@uthavu.org',
        role: { key: 'ops_admin' },
        isSelf: true,
      });
    });

    it('cannot change a role, because the route has nowhere to put one', async () => {
      // The type says so, and so does the DTO — `UpdateMyAdminProfileDto` has
      // no roleKey field and is strict, so a body carrying one is a 400 rather
      // than a 200 that silently promoted nobody. This asserts the runtime half:
      // even a cast-through attempt leaves the role alone.
      await service.updateMyProfile(asOps, {
        name: 'Ops Lead',
        roleKey: 'super_admin',
      } as unknown as Parameters<typeof service.updateMyProfile>[1]);

      expect(await roleKeyOf(opsId)).toBe('ops_admin');
    });

    it('records admin.update with the actor as its own target', async () => {
      await service.updateMyProfile(asSuperA, { name: 'Super A. Kumar' });

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actionKey: 'admin.update',
        actorUserId: superAId,
        targetId: superAId,
        before: { name: 'Super A', email: 'super-a@uthavu.org' },
        after: { name: 'Super A. Kumar', email: 'super-a@uthavu.org' },
      });
    });

    it('writes nothing for a PATCH that changes nothing', async () => {
      const detail = await service.updateMyProfile(asSuperA, {
        name: 'Super A',
      });

      expect(detail.name).toBe('Super A');
      // An audit row saying this account was edited would be false.
      expect(await auditRows()).toHaveLength(0);
    });

    it('refuses an email another admin already holds', async () => {
      await expect(
        service.updateMyProfile(asOps, { email: 'super-b@uthavu.org' }),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_EMAIL_TAKEN' } });
    });

    it('leaves PATCH /admin/admins/:id refusing self, so the privileged route stays aimed elsewhere', async () => {
      // The two routes are the owner's permission table: "edit own profile" is
      // both roles, "edit another admin" is Super Admin only. Self-editing goes
      // through the route with no role field; the role-capable route never
      // points at the caller.
      await expect(
        service.update(asSuperA, superAId, { name: 'Sneaky' }),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_MODIFY_SELF' } });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /admin/admins
  // ────────────────────────────────────────────────────────────────────────

  describe('provisioning a new admin', () => {
    const newAdmin = {
      name: 'Nila R',
      email: 'nila@uthavu.org',
      password: 'correct horse battery',
      roleKey: 'ops_admin' as const,
    };

    it('creates the user, the credential account and the admin grant together', async () => {
      const detail = await service.create(asSuperA, newAdmin);

      expect(detail).toMatchObject({
        name: 'Nila R',
        email: 'nila@uthavu.org',
        role: { key: 'ops_admin' },
        status: { key: 'active' },
        lastLoginAt: null,
        isSelf: false,
        isLastSuperAdmin: false,
      });

      // The credential Better Auth will actually look up: (issuer, accountId,
      // providerId). A row with the wrong issuer is a password nobody can use.
      const [credential] = await db
        .select()
        .from(account)
        .where(eq(account.userId, detail.userId));
      expect(credential).toMatchObject({
        providerId: 'credential',
        issuer: 'local:credential',
        accountId: detail.userId,
      });
      expect(await roleKeyOf(detail.userId)).toBe('ops_admin');
    });

    it('stores the hasher output and never the plaintext', async () => {
      const detail = await service.create(asSuperA, newAdmin);

      expect(hashMock).toHaveBeenCalledWith(newAdmin.password);
      expect(await passwordOf(detail.userId)).toBe(
        `hashed:${newAdmin.password}`,
      );
    });

    it('never returns anything password-shaped', async () => {
      const detail = await service.create(asSuperA, newAdmin);
      expect(Object.keys(detail)).toEqual(
        expect.not.arrayContaining(['password', 'passwordHash', 'newPassword']),
      );
    });

    it('records admin.create without the password in the diff', async () => {
      const detail = await service.create(asSuperA, newAdmin);

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actionKey: 'admin.create',
        actorUserId: superAId,
        targetId: detail.userId,
        targetLabel: 'Nila R',
        before: null,
        after: {
          name: 'Nila R',
          email: 'nila@uthavu.org',
          roleKey: 'ops_admin',
        },
      });
    });

    it('refuses an email that already exists, case-insensitively', async () => {
      await expect(
        service.create(asSuperA, { ...newAdmin, email: 'Super-B@Uthavu.org' }),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_EMAIL_TAKEN' } });

      // `user.email` is unique on the exact string, so a case variant would
      // otherwise become a second row that nobody can sign in as.
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(notInArray(user.id, FIXTURE_USER_IDS));
      expect(rows).toHaveLength(0);
    });

    it('writes nothing at all when the audit write fails — the log is inside the transaction', async () => {
      // Removing the catalogue row makes AdminAuditService.record() throw its
      // "did db:seed run?" error from inside the mutation's transaction. If the
      // insert and the audit entry were not atomic, an admin account would
      // exist here that nobody could attribute to anyone.
      const [removed] = await db
        .delete(adminAuditActions)
        .where(eq(adminAuditActions.key, 'admin.create'))
        .returning();

      try {
        await expect(service.create(asSuperA, newAdmin)).rejects.toThrow(
          /admin_audit_actions row missing/,
        );

        const created = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, newAdmin.email));
        expect(created).toHaveLength(0);
      } finally {
        await db.insert(adminAuditActions).values(removed);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Safety rule 1 — the last Super Admin
  // ────────────────────────────────────────────────────────────────────────

  describe('rule 1: the last Super Admin can never be suspended, revoked or demoted', () => {
    it('refuses to suspend them', async () => {
      await removeSuperB();

      await expect(service.suspend(asOps, superAId, {})).rejects.toMatchObject({
        response: { code: 'LAST_SUPER_ADMIN' },
      });

      expect(await isUserSuspended(superAId)).toBe(false);
      expect(await auditRows()).toHaveLength(0);
    });

    it('refuses to revoke their access', async () => {
      await removeSuperB();

      await expect(service.revoke(asOps, superAId)).rejects.toMatchObject({
        response: { code: 'LAST_SUPER_ADMIN' },
      });

      expect(await roleKeyOf(superAId)).toBe('super_admin');
      expect(await auditRows()).toHaveLength(0);
    });

    it('refuses to demote them', async () => {
      await removeSuperB();

      await expect(
        service.update(asOps, superAId, { roleKey: 'ops_admin' }),
      ).rejects.toMatchObject({ response: { code: 'LAST_SUPER_ADMIN' } });

      expect(await roleKeyOf(superAId)).toBe('super_admin');
      expect(await auditRows()).toHaveLength(0);
    });

    it('does not treat a SUSPENDED Super Admin as a spare', async () => {
      // The failure this whole rule exists to prevent, in its least obvious
      // form: two `super_admin` rows, one of whom cannot log in (ADR 0011).
      // A count of rows would say "there are two, go ahead" and lock the
      // console permanently.
      await makeSuperBSuspended();

      await expect(service.suspend(asOps, superAId, {})).rejects.toMatchObject({
        response: { code: 'LAST_SUPER_ADMIN' },
      });
      await expect(service.revoke(asOps, superAId)).rejects.toMatchObject({
        response: { code: 'LAST_SUPER_ADMIN' },
      });
    });

    it('allows all three while a second Super Admin can still sign in', async () => {
      const suspended = await service.suspend(asOps, superAId, {
        reason: 'Laptop stolen',
      });
      expect(suspended.status.key).toBe('suspended');

      // Super B is now the last one — so the rule that just let Super A be
      // suspended now protects Super B, from the same code path.
      await expect(service.suspend(asOps, superBId, {})).rejects.toMatchObject({
        response: { code: 'LAST_SUPER_ADMIN' },
      });
    });

    it('lets an already-suspended Super Admin be revoked — they were never a way in', async () => {
      await makeSuperBSuspended();

      await service.revoke(asSuperA, superBId);

      expect(await roleKeyOf(superBId)).toBeNull();
      expect((await auditRows())[0]).toMatchObject({
        actionKey: 'admin.revoke',
      });
    });

    it('never fires for an Ops Admin', async () => {
      await removeSuperB();

      await service.revoke(asSuperA, opsId);
      expect(await roleKeyOf(opsId)).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Safety rule 2 — self
  // ────────────────────────────────────────────────────────────────────────

  describe('rule 2: an admin cannot suspend, revoke or demote themselves', () => {
    it('refuses a self-suspend', async () => {
      await expect(
        service.suspend(asSuperA, superAId, {}),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_MODIFY_SELF' } });
      expect(await isUserSuspended(superAId)).toBe(false);
    });

    it('refuses a self-revoke', async () => {
      await expect(service.revoke(asSuperA, superAId)).rejects.toMatchObject({
        response: { code: 'CANNOT_MODIFY_SELF' },
      });
      expect(await roleKeyOf(superAId)).toBe('super_admin');
    });

    it('refuses a self-demote', async () => {
      await expect(
        service.update(asSuperA, superAId, { roleKey: 'ops_admin' }),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_MODIFY_SELF' } });
      expect(await roleKeyOf(superAId)).toBe('super_admin');
    });

    it('refuses a self reset-password and points at the route that is allowed', async () => {
      await expect(
        service.resetPassword(asSuperA, superAId, { newPassword: 'whatever8' }),
      ).rejects.toMatchObject({
        response: {
          code: 'CANNOT_MODIFY_SELF',
          message: expect.stringContaining(
            '/admin/me/change-password',
          ) as string,
        },
      });
      expect(await passwordOf(superAId)).toBe('hashed:original-password');
    });

    it('fires even when plenty of other Super Admins exist', async () => {
      // Not the last-Super-Admin rule wearing a different hat: Super B is
      // active and could take over, and this is still refused. Rule 2 is about
      // one person not being able to remove themselves in one click.
      const detail = await service.findOne(asSuperA, superAId);
      expect(detail.isLastSuperAdmin).toBe(false);

      await expect(
        service.suspend(asSuperA, superAId, {}),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_MODIFY_SELF' } });
    });

    it('writes no audit row for a refused self-action', async () => {
      await expect(service.revoke(asSuperA, superAId)).rejects.toThrow();
      expect(await auditRows()).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Safety rule 3 — the self-service route and its current-password demand
  // ────────────────────────────────────────────────────────────────────────

  describe('rule 3: change-password is the only self route, and it demands the current password', () => {
    it('rejects a wrong current password and writes nothing', async () => {
      await expect(
        service.changeMyPassword(asSuperA, {
          currentPassword: 'not-the-one',
          newPassword: 'a-brand-new-one',
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CURRENT_PASSWORD' },
      });

      expect(await passwordOf(superAId)).toBe('hashed:original-password');
      expect(await auditRows()).toHaveLength(0);
      // Refused before hashing — no point paying for scrypt on a failed attempt.
      expect(hashMock).not.toHaveBeenCalled();
    });

    it('accepts the correct current password and stores the new hash', async () => {
      await service.changeMyPassword(asSuperA, {
        currentPassword: 'original-password',
        newPassword: 'a-brand-new-one',
      });

      expect(verifyMock).toHaveBeenCalledWith({
        hash: 'hashed:original-password',
        password: 'original-password',
      });
      expect(await passwordOf(superAId)).toBe('hashed:a-brand-new-one');
    });

    it('audits a self-service change with actor == target', async () => {
      await service.changeMyPassword(asSuperA, {
        currentPassword: 'original-password',
        newPassword: 'a-brand-new-one',
      });

      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actionKey: 'admin.password_reset',
        actorUserId: superAId,
        targetId: superAId,
        // The whole point: no value, no hash, no length.
        before: null,
        after: null,
      });
    });

    it('deliberately does NOT ask a Super Admin for a password they cannot know', async () => {
      // reset-password takes no currentPassword. A Super Admin resetting a
      // locked-out colleague's credential has nothing to prove possession of,
      // and inventing a field for them to fill would be theatre.
      await service.resetPassword(asSuperA, superBId, {
        newPassword: 'issued-by-super-a',
      });

      expect(verifyMock).not.toHaveBeenCalled();
      expect(await passwordOf(superBId)).toBe('hashed:issued-by-super-a');
      expect((await auditRows())[0]).toMatchObject({
        actionKey: 'admin.password_reset',
        actorUserId: superAId,
        targetId: superBId,
        before: null,
        after: null,
      });
    });

    it('gives a credential-less admin one rather than 404ing on a technicality', async () => {
      await db.delete(account).where(eq(account.userId, superBId));

      await service.resetPassword(asSuperA, superBId, {
        newPassword: 'first-ever-password',
      });

      expect(await passwordOf(superBId)).toBe('hashed:first-ever-password');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // DELETE
  // ────────────────────────────────────────────────────────────────────────

  describe('DELETE revokes admin access — it does not delete the user', () => {
    it('removes the admin_users row and leaves the person and their content alone', async () => {
      const reportId = uuidv7();
      await db.insert(reports).values({
        id: reportId,
        reporterId: superBId,
        categoryId: lookups.categoryIds.medicalHelp,
        statusId: lookups.reportStatusIds.open,
        title: 'Need blood urgently',
        description: 'O negative at Apollo',
        lat: 13.08,
        lng: 80.27,
        expiryAt: new Date(Date.now() + HOUR),
      });

      await service.revoke(asSuperA, superBId);

      // Admin access: gone.
      expect(await roleKeyOf(superBId)).toBeNull();

      // The person: still here, with their account and everything they made.
      const [stillAUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, superBId));
      expect(stillAUser).toMatchObject({
        id: superBId,
        name: 'Super B',
        email: 'super-b@uthavu.org',
      });
      const theirReports = await db
        .select()
        .from(reports)
        .where(eq(reports.reporterId, superBId));
      expect(theirReports).toHaveLength(1);
      // Their sign-in credential survives too: revoking console access does not
      // take away the underlying account.
      expect(await passwordOf(superBId)).toBe('hashed:original-password');
    });

    it("keeps the revoked admin's own audit trail readable", async () => {
      // Super B did something first, then loses access. ADR 0012's actor
      // snapshot is what makes their entry still say who it was.
      await service.suspend(asSuperA, opsId, { reason: 'Sharing a login' });
      await service.revoke(asSuperA, superBId);

      const rows = await auditRows();
      expect(rows.map((r) => r.actionKey).sort()).toEqual([
        'admin.revoke',
        'admin.suspend',
      ]);
    });

    it('records admin.revoke with the role that was taken away', async () => {
      await service.revoke(asSuperA, superBId);

      expect((await auditRows())[0]).toMatchObject({
        actionKey: 'admin.revoke',
        targetId: superBId,
        targetLabel: 'Super B',
        before: {
          roleKey: 'super_admin',
          name: 'Super B',
          email: 'super-b@uthavu.org',
        },
        after: null,
      });
    });

    it('404s rather than silently succeeding for a non-admin', async () => {
      await expect(service.revoke(asSuperA, citizenId)).rejects.toMatchObject({
        response: { code: 'ADMIN_NOT_FOUND' },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Suspension reuses ADR 0011
  // ────────────────────────────────────────────────────────────────────────

  describe('suspension reuses user_account_status, so ADR 0011 enforces it for free', () => {
    it('makes isUserSuspended() true — the same predicate login and the guard read', async () => {
      expect(await isUserSuspended(superBId)).toBe(false);

      const detail = await service.suspend(asSuperA, superBId, {
        reason: 'Left the organisation',
      });

      expect(detail.status).toEqual({ key: 'suspended', label: 'Suspended' });
      // No parallel admin-status table: this is the one row both enforcement
      // points in ADR 0011 already consult.
      expect(await isUserSuspended(superBId)).toBe(true);

      const [row] = await db
        .select()
        .from(userAccountStatus)
        .where(eq(userAccountStatus.userId, superBId));
      expect(row).toMatchObject({
        reason: 'Left the organisation',
        suspendedBy: superAId,
      });
    });

    it('reactivates, clearing the suspension columns and leaving the row', async () => {
      await service.suspend(asSuperA, superBId, { reason: 'Under review' });

      const detail = await service.reactivate(asSuperA, superBId, {});

      expect(detail.status.key).toBe('active');
      expect(await isUserSuspended(superBId)).toBe(false);

      const [row] = await db
        .select()
        .from(userAccountStatus)
        .where(eq(userAccountStatus.userId, superBId));
      expect(row).toMatchObject({
        reason: null,
        suspendedAt: null,
        suspendedBy: null,
      });
    });

    it('records admin.suspend and admin.reactivate with the reason', async () => {
      await service.suspend(asSuperA, superBId, { reason: 'Under review' });
      await service.reactivate(asSuperA, superBId, { reason: 'Cleared' });

      const rows = await auditRows();
      expect(rows.map((r) => r.actionKey).sort()).toEqual([
        'admin.reactivate',
        'admin.suspend',
      ]);
      expect(rows.find((r) => r.actionKey === 'admin.suspend')).toMatchObject({
        reason: 'Under review',
        after: expect.objectContaining({ status: 'suspended' }) as object,
      });
    });

    it('refuses a double suspend and a reactivate of an active account', async () => {
      await service.suspend(asSuperA, superBId, {});
      await expect(
        service.suspend(asSuperA, superBId, {}),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_ALREADY_SUSPENDED' },
      });

      await service.reactivate(asSuperA, superBId, {});
      await expect(
        service.reactivate(asSuperA, superBId, {}),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_NOT_SUSPENDED' } });
    });

    it('never lets a reactivate be blocked by the rules that guard removal', async () => {
      // Reactivate has no self-check and no last-Super-Admin check on purpose:
      // it only ever adds a way into the console. Suspend Super A via Ops,
      // then let Super A back in — even though at that moment Super B is the
      // last one standing.
      await service.suspend(asOps, superAId, {});
      const restored = await service.reactivate(asOps, superAId, {});
      expect(restored.status.key).toBe('active');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // PATCH
  // ────────────────────────────────────────────────────────────────────────

  describe('editing an admin', () => {
    it('updates name and email under admin.update', async () => {
      const detail = await service.update(asSuperA, superBId, {
        name: 'Super B (Ops lead)',
        email: 'b.ops@uthavu.org',
      });

      expect(detail).toMatchObject({
        name: 'Super B (Ops lead)',
        email: 'b.ops@uthavu.org',
      });
      expect((await auditRows())[0]).toMatchObject({
        actionKey: 'admin.update',
        before: { name: 'Super B', email: 'super-b@uthavu.org' },
        after: { name: 'Super B (Ops lead)', email: 'b.ops@uthavu.org' },
      });
    });

    it('records a role change as admin.role_change, not admin.update', async () => {
      const detail = await service.update(asSuperA, superBId, {
        roleKey: 'ops_admin',
      });

      expect(detail.role).toEqual({ key: 'ops_admin', label: 'Ops Admin' });
      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actionKey: 'admin.role_change',
        before: { roleKey: 'super_admin' },
        after: { roleKey: 'ops_admin' },
      });
    });

    it('writes both entries when a PATCH changes a profile field and the role', async () => {
      await service.update(asSuperA, superBId, {
        name: 'Bea',
        roleKey: 'ops_admin',
      });

      const rows = await auditRows();
      expect(rows.map((r) => r.actionKey).sort()).toEqual([
        'admin.role_change',
        'admin.update',
      ]);
    });

    it('refuses an email another account already holds', async () => {
      await expect(
        service.update(asSuperA, superBId, { email: 'ops@uthavu.org' }),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_EMAIL_TAKEN' } });
    });

    it('allows a no-op email that belongs to the account being edited', async () => {
      const detail = await service.update(asSuperA, superBId, {
        name: 'Super Bee',
        email: 'super-b@uthavu.org',
      });
      expect(detail.name).toBe('Super Bee');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // The sweep
  // ────────────────────────────────────────────────────────────────────────

  describe('no plaintext password ever reaches storage or the audit log', () => {
    it('holds across every route that touches one', async () => {
      const PLAINTEXTS = [
        'provisioned-secret-1',
        'reset-secret-2',
        'changed-secret-3',
      ];

      const created = await service.create(asSuperA, {
        name: 'Nila R',
        email: 'nila@uthavu.org',
        password: PLAINTEXTS[0],
        roleKey: 'ops_admin',
      });
      await service.resetPassword(asSuperA, superBId, {
        newPassword: PLAINTEXTS[1],
      });
      await service.changeMyPassword(asSuperA, {
        currentPassword: 'original-password',
        newPassword: PLAINTEXTS[2],
      });

      // Every stored credential is the hasher's output, never the input.
      for (const [userId, plaintext] of [
        [created.userId, PLAINTEXTS[0]],
        [superBId, PLAINTEXTS[1]],
        [superAId, PLAINTEXTS[2]],
      ] as const) {
        const stored = await passwordOf(userId);
        expect(stored).toBe(`hashed:${plaintext}`);
        expect(stored).not.toBe(plaintext);
      }

      // And nothing password-shaped — plaintext OR hash — is anywhere in what
      // the audit rows RECORD. Serialising the payloads and searching them
      // catches a future `after: { ...dto }` that a field-by-field assertion
      // would miss. Only before/after/reason are searched: the action key is
      // legitimately `admin.password_reset`, and asserting over that too would
      // make this test fail for the one reason that is not a leak.
      const payloads = JSON.stringify(
        (await auditRows()).map(({ before, after, reason }) => ({
          before,
          after,
          reason,
        })),
      );
      for (const plaintext of PLAINTEXTS) {
        expect(payloads).not.toContain(plaintext);
      }
      expect(payloads).not.toContain('hashed:');
      expect(payloads).not.toContain('password');
    });
  });
});
