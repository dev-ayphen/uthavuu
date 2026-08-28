import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

jest.mock('../db', () => {
  const postgresModule = jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<typeof import('drizzle-orm/postgres-js')>(
    'drizzle-orm/postgres-js',
  );
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_suspension_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import type { ExecutionContext } from '@nestjs/common';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { adminUsers } from '../db/schema/admin-schema';
import { userAccountStatus } from '../db/schema/user-status-schema';
import { adminAuditLogs } from '../db/schema/audit-schema';
import { AdminUsersService } from './admin-users.service';
import { AdminAuditService } from './admin-audit.service';
import { SuspendedAccountGuard } from '../account-status/suspended-account.guard';
import { isUserSuspended } from '../account-status/account-status';
import { createSpecDatabase, fakeAdmin, seedLookups } from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_suspension_test';
const HOUR = 60 * 60 * 1000;

/** A minimal ExecutionContext — the guard only ever reads the HTTP request. */
function httpContext(request: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('Account suspension', () => {
  const auditService = new AdminAuditService();
  const service = new AdminUsersService(auditService);
  const guard = new SuspendedAccountGuard();

  let lookups: Awaited<ReturnType<typeof seedLookups>>;

  const reporterId = uuidv7();   // Hari — gets suspended
  const volunteerId = uuidv7();  // Priya — must be unaffected
  const adminUserId = uuidv7();
  const opsUserId = uuidv7();
  const reportId = uuidv7();
  const missionId = uuidv7();
  const volunteerRowId = uuidv7();

  const admin = fakeAdmin({
    userId: adminUserId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      { id: reporterId, name: 'Hari S', email: 'hari@test.local', phoneNumber: '+919000000001' },
      { id: volunteerId, name: 'Priya K', email: 'priya@test.local', phoneNumber: '+919000000002' },
      { id: adminUserId, name: 'Super Admin', email: 'admin@uthavu.org' },
      { id: opsUserId, name: 'Ops Admin', email: 'ops@uthavu.org' },
    ]);
    await db.insert(adminUsers).values([
      { userId: adminUserId, roleId: lookups.adminRoleIds.super_admin },
      { userId: opsUserId, roleId: lookups.adminRoleIds.ops_admin },
    ]);

    // Hari asks for help; Priya has already accepted and confirmed.
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.open,
      title: 'Need blood urgently',
      description: 'O negative at Apollo',
      lat: 13.08,
      lng: 80.27,
      expiryAt: new Date(Date.now() + HOUR),
    });
    await db.insert(missions).values({ id: missionId, reportId });
    await db.insert(missionVolunteers).values({
      id: volunteerRowId,
      missionId,
      volunteerId,
      statusId: lookups.volunteerStatusIds.active,
      confirmDeadline: new Date(Date.now() + 15 * 60 * 1000),
      confirmedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  afterEach(async () => {
    await db.delete(userAccountStatus);
    await db.delete(adminAuditLogs);
  });

  describe('the mandatory rule: suspending a reporter must never strand their volunteer', () => {
    it('leaves the report, the mission and the volunteer row completely untouched', async () => {
      const before = {
        report: (await db.select().from(reports).where(eq(reports.id, reportId)))[0],
        mission: (await db.select().from(missions).where(eq(missions.id, missionId)))[0],
        volunteer: (
          await db.select().from(missionVolunteers).where(eq(missionVolunteers.id, volunteerRowId))
        )[0],
      };

      await service.suspend(admin, reporterId, { reason: 'Repeated fake reports' });

      const after = {
        report: (await db.select().from(reports).where(eq(reports.id, reportId)))[0],
        mission: (await db.select().from(missions).where(eq(missions.id, missionId)))[0],
        volunteer: (
          await db.select().from(missionVolunteers).where(eq(missionVolunteers.id, volunteerRowId))
        )[0],
      };

      // Byte-for-byte identical. Not "still open" or "still active" — nothing at
      // all changed, which is the only assertion that stays true if someone
      // later adds a cascade nobody asked for.
      expect(after).toEqual(before);
    });

    it('lets the volunteer keep making authenticated requests', async () => {
      await service.suspend(admin, reporterId, { reason: 'Repeated fake reports' });

      // Priya's request carries Priya's session. The guard never consults the
      // reporter of anything she is working on.
      await expect(
        guard.canActivate(httpContext({ session: { user: { id: volunteerId } } })),
      ).resolves.toBe(true);

      expect(await isUserSuspended(volunteerId)).toBe(false);
    });

    it('blocks the suspended reporter with a distinguishable code, not a bare 401', async () => {
      await service.suspend(admin, reporterId, { reason: 'Repeated fake reports' });

      await expect(
        guard.canActivate(httpContext({ session: { user: { id: reporterId } } })),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'ACCOUNT_SUSPENDED' },
      });
    });

    it('keeps the reporter session resolvable so the client can be told why', async () => {
      // If suspension deleted session rows, every call would 401 and the mobile
      // client could not tell suspension from an expired token — it would sign
      // the user out silently. The session row must survive.
      await service.suspend(admin, reporterId, { reason: 'Repeated fake reports' });
      const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, reporterId));
      expect(row).toBeDefined();
    });
  });

  describe('enforcement', () => {
    it('passes anonymous requests through — a 401 is the auth guard\'s to raise', async () => {
      await expect(guard.canActivate(httpContext({ session: null }))).resolves.toBe(true);
    });

    it('fails loudly if it runs before the session is resolved', async () => {
      // `undefined` means the library AuthGuard has not run. Treating that as
      // anonymous would silently disable suspension; this caught a real
      // guard-ordering bug on the first live request.
      await expect(
        guard.canActivate(httpContext({})),
      ).rejects.toMatchObject({ status: 500, response: { code: 'AUTH_GUARD_ORDER' } });
    });

    it('stops blocking the moment the account is reactivated', async () => {
      await service.suspend(admin, reporterId, { reason: 'Repeated fake reports' });
      expect(await isUserSuspended(reporterId)).toBe(true);

      await service.reactivate(admin, reporterId, {});
      expect(await isUserSuspended(reporterId)).toBe(false);
      await expect(
        guard.canActivate(httpContext({ session: { user: { id: reporterId } } })),
      ).resolves.toBe(true);
    });
  });

  describe('rules and audit', () => {
    it('records who suspended whom and why, in the same transaction', async () => {
      await service.suspend(admin, reporterId, { reason: 'Repeated fake reports' }, {
        ipAddress: '10.0.0.9',
        userAgent: 'Chrome/141',
      });

      const { items, pagination } = await auditService.list({ page: 1, limit: 10 });
      expect(pagination.total).toBe(1);
      expect(items[0]).toMatchObject({
        actor: { userId: adminUserId, email: 'admin@uthavu.org', roleKey: 'super_admin' },
        action: { key: 'user.suspend' },
        target: { type: { key: 'user' }, id: reporterId, label: 'Hari S' },
        before: { status: 'active' },
        after: { status: 'suspended' },
        reason: 'Repeated fake reports',
        ipAddress: '10.0.0.9',
      });
    });

    it('records the reactivation as its own entry, keeping the history', async () => {
      await service.suspend(admin, reporterId, { reason: 'Spam' });
      await service.reactivate(admin, reporterId, { reason: 'Appeal upheld' });

      const { items } = await auditService.list({ page: 1, limit: 10 });
      expect(items.map((i) => i.action.key)).toEqual(['user.reactivate', 'user.suspend']);
      // user_account_status only holds the current state, so this trail is the
      // ONLY record that the account was ever suspended.
      expect(items[0]).toMatchObject({
        before: { status: 'suspended', reason: 'Spam' },
        after: { status: 'active' },
        reason: 'Appeal upheld',
      });
    });

    it('is reversible and re-appliable', async () => {
      await service.suspend(admin, reporterId, { reason: 'First' });
      await service.reactivate(admin, reporterId, {});
      const result = await service.suspend(admin, reporterId, { reason: 'Second' });

      expect(result.status).toMatchObject({ key: 'suspended', reason: 'Second' });
      expect(await isUserSuspended(reporterId)).toBe(true);
    });

    it('surfaces the suspension on the user detail, with who did it', async () => {
      await service.suspend(admin, reporterId, { reason: 'Harassment in comments' });
      const detail = await service.findOne(reporterId);

      expect(detail.status).toMatchObject({
        key: 'suspended',
        label: 'Suspended',
        reason: 'Harassment in comments',
        suspendedBy: { id: adminUserId, email: 'admin@uthavu.org' },
      });
      expect(detail.status.suspendedAt).not.toBeNull();
    });

    it('refuses to suspend a staff account', async () => {
      await expect(
        service.suspend(admin, opsUserId, { reason: 'nope' }),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_SUSPEND_ADMIN' } });
    });

    it('refuses to suspend yourself', async () => {
      await expect(
        service.suspend(admin, adminUserId, { reason: 'nope' }),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_SUSPEND_SELF' } });
    });

    it('409s on a double suspend and on reactivating an active account', async () => {
      await service.suspend(admin, reporterId, { reason: 'First' });
      await expect(
        service.suspend(admin, reporterId, { reason: 'Again' }),
      ).rejects.toMatchObject({ response: { code: 'USER_ALREADY_SUSPENDED' } });

      await service.reactivate(admin, reporterId, {});
      await expect(
        service.reactivate(admin, reporterId, {}),
      ).rejects.toMatchObject({ response: { code: 'USER_NOT_SUSPENDED' } });
    });

    it('404s for an unknown user', async () => {
      await expect(
        service.suspend(admin, uuidv7(), { reason: 'nope' }),
      ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
    });

    it('filters the user list by account status', async () => {
      const query = {
        page: 1, limit: 50, audience: 'citizen' as const,
        sort: 'createdAt' as const, order: 'desc' as const,
      };
      await service.suspend(admin, reporterId, { reason: 'Spam' });

      expect((await service.list({ ...query, status: 'suspended' })).pagination.total).toBe(1);
      expect((await service.list({ ...query, status: 'active' })).pagination.total).toBe(1);
      expect((await service.list({ ...query, status: 'all' })).pagination.total).toBe(2);
    });
  });
});
