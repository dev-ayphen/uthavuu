import 'dotenv/config';
import { uuidv7 } from 'uuidv7';

/**
 * ADR 0011 enforcement point #1 — the LOGIN block.
 *
 * This suite exists because that point had zero coverage. `auth/auth.ts` is the
 * only file in the API that no spec could import: it pulls in `better-auth`,
 * `better-auth/api`, `better-auth/adapters/drizzle` and `better-auth/plugins`,
 * all ESM-only, and this package transforms to CommonJS for Jest. So the rule
 * deciding whether a suspended person may sign in could have been deleted
 * outright and every test in the repo would still have passed.
 *
 * It is covered here in two layers, because either one alone leaves a way to be
 * wrong:
 *
 *  1. `decideSessionCreate` against a real database — does the rule give the
 *     right answer, and does the rejection carry the shape the mobile client
 *     keys on.
 *  2. The hook in `auth.ts` that calls it — is the rule actually WIRED. Layer 1
 *     passes just as happily if `databaseHooks` were deleted, which is exactly
 *     the failure this whole suite is here to make impossible.
 *
 * Layer 2 is reachable at all only because the four ESM imports are mocked
 * below — the same technique admin-module-guard.spec.ts uses on
 * @thallesp/nestjs-better-auth, and the reason admin-rbac.ts:13-17 exists.
 *
 * NOT covered here, deliberately, because admin-users-suspension.service.spec.ts
 * already proves it and a second copy would only drift: the request guard's 403,
 * the audit trail, the suspend/reactivate business rules, and the guarantee that
 * suspending a reporter leaves their report, mission and volunteer rows
 * untouched.
 */

// Own throwaway database, per the note in admin/testing/admin-spec-db.ts: the
// factory is hoisted above every import, so it cannot close over anything and
// the name has to be a literal.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_login_block_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

// The four ESM-only imports that make auth.ts unloadable under this transform.
// Each is stubbed to the smallest thing that lets the module finish evaluating;
// `betterAuth` hands its config straight back so the real hook can be pulled out
// of it and run.
jest.mock('better-auth', () => ({
  betterAuth: (config: unknown) => ({ __config: config }),
}));
jest.mock('better-auth/api', () => ({
  // A spy, not a re-implementation: asserting against a copy of the library's
  // own mapping would be circular. What matters is the arguments auth.ts hands
  // it. (`APIError.from(status, { code, message })` verified against the
  // installed @better-auth/core 1.7.1 source; FORBIDDEN is 403 in
  // better-call's own statusCodes table.)
  APIError: {
    from: jest.fn((status: string, error: { code: string; message: string }) =>
      Object.assign(new Error(error.message), { status, body: error }),
    ),
  },
  createAuthMiddleware: (handler: unknown) => handler,
}));
jest.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => ({}),
}));
jest.mock('better-auth/plugins', () => ({
  bearer: () => ({}),
  phoneNumber: () => ({}),
}));

// auth.ts constructs an OTP provider at module scope, and both providers import
// the shared ioredis connection at THEIR module scope. Without this the suite
// opens a real Redis socket it never uses and then hangs Jest on exit.
jest.mock('../lib/redis', () => ({
  redis: { set: jest.fn(), incr: jest.fn(), expire: jest.fn(), ttl: jest.fn() },
}));

import { APIError } from 'better-auth/api';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { adminUsers } from '../db/schema/admin-schema';
import { userAccountStatus } from '../db/schema/user-status-schema';
import { adminAuditLogs } from '../db/schema/audit-schema';
import {
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
} from './account-status';
import { decideSessionCreate } from './login-block';
import { SuspendedAccountGuard } from './suspended-account.guard';
import { AdminUsersService } from '../admin/admin-users.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from '../admin/testing/admin-spec-db';
import { auth } from '../auth/auth';

const DATABASE = 'uthavu_login_block_test';

/**
 * The spy behind the mocked `APIError.from`, captured once so the assertions
 * below read a local rather than an object property.
 *
 * `unbound-method` is disabled for this single line and nowhere else: the rule
 * guards against detaching a method that needs its `this`, and this is a
 * `jest.fn()` installed by the factory above, which has no `this` to lose. It
 * is never called here — only asserted on.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
const apiErrorFrom = APIError.from as unknown as jest.Mock;

/**
 * The `session.create.before` hook exactly as auth.ts configured it — pulled
 * back out of the config object the mocked `betterAuth` handed straight through.
 * Every field is optional here on purpose: `undefined` at any level means the
 * hook is not wired, which is the regression worth failing on.
 */
type SessionCreateHook = (session: { userId: string }) => Promise<void>;
interface CapturedAuthConfig {
  databaseHooks?: {
    session?: { create?: { before?: SessionCreateHook } };
  };
}
function sessionCreateHook(): SessionCreateHook | undefined {
  const { __config: config } = auth as unknown as {
    __config?: CapturedAuthConfig;
  };
  return config?.databaseHooks?.session?.create?.before;
}

describe('Account suspension — the login block (ADR 0011 enforcement point #1)', () => {
  const auditService = new AdminAuditService();
  const adminUsersService = new AdminUsersService(auditService);

  let lookups: Awaited<ReturnType<typeof seedLookups>>;

  const suspendedId = uuidv7(); // Hari — suspended
  const activeId = uuidv7(); // has an explicit `active` row
  const noRowId = uuidv7(); // no user_account_status row at all — the common case
  const volunteerId = uuidv7(); // Priya — helping Hari, must still be able to log in
  const adminUserId = uuidv7();

  const admin = fakeAdmin({
    userId: adminUserId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);

    await db.insert(user).values([
      {
        id: suspendedId,
        name: 'Hari S',
        email: 'hari@test.local',
        phoneNumber: '+919000000101',
      },
      {
        id: activeId,
        name: 'Arun M',
        email: 'arun@test.local',
        phoneNumber: '+919000000102',
      },
      {
        id: noRowId,
        name: 'Meena R',
        email: 'meena@test.local',
        phoneNumber: '+919000000103',
      },
      {
        id: volunteerId,
        name: 'Priya K',
        email: 'priya@test.local',
        phoneNumber: '+919000000104',
      },
      { id: adminUserId, name: 'Super Admin', email: 'admin@uthavu.org' },
    ]);
    await db
      .insert(adminUsers)
      .values([
        { userId: adminUserId, roleId: lookups.adminRoleIds.super_admin },
      ]);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    apiErrorFrom.mockClear();
    await db.insert(userAccountStatus).values([
      {
        userId: suspendedId,
        statusId: lookups.userStatusIds.suspended,
        reason: 'Repeated fake reports',
        suspendedAt: new Date(),
        suspendedBy: adminUserId,
      },
      { userId: activeId, statusId: lookups.userStatusIds.active },
    ]);
  });

  afterEach(async () => {
    await db.delete(userAccountStatus);
    await db.delete(adminAuditLogs);
  });

  describe('the decision', () => {
    it('refuses to create a session for a suspended account', async () => {
      // Exact equality, not a partial match. The status, the code and the
      // message are the whole contract this function has with auth.ts; a
      // toMatchObject here would pass while an extra field leaked through.
      await expect(
        decideSessionCreate({ userId: suspendedId }),
      ).resolves.toEqual({
        allowed: false,
        status: 'FORBIDDEN',
        error: {
          code: ACCOUNT_SUSPENDED_CODE,
          message: ACCOUNT_SUSPENDED_MESSAGE,
        },
      });
    });

    it('allows an account carrying an explicit `active` status row', async () => {
      await expect(decideSessionCreate({ userId: activeId })).resolves.toEqual({
        allowed: true,
      });
    });

    it('allows an account with no user_account_status row at all', async () => {
      // The overwhelmingly common case — absence of a row means active
      // (user-status-schema.ts). Getting this backwards would lock every
      // ordinary user out of the product on the next deploy, so it is worth a
      // test of its own rather than being folded into the case above.
      await expect(decideSessionCreate({ userId: noRowId })).resolves.toEqual({
        allowed: true,
      });
    });

    it('never puts the moderation reason in what the rejected user is told', async () => {
      // `reason` is staff-only (user-status-schema.ts:79-82) and a login
      // rejection is the most citizen-facing string in the product. Reading it
      // out of the row rather than repeating the literal keeps this honest if
      // the seeded reason above ever changes.
      const decision = await decideSessionCreate({ userId: suspendedId });

      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;
      expect(decision.error.message).not.toMatch(/fake reports/i);
    });

    it('judges only the account signing in, never anyone they are involved with', async () => {
      // ADR 0011's load-bearing scenario, applied to login: Hari is suspended
      // mid-mission and Priya, who is helping him, must still be able to sign
      // in. admin-users-suspension.service.spec.ts proves this for the request
      // guard; nothing proved it for the login path.
      await expect(
        decideSessionCreate({ userId: volunteerId }),
      ).resolves.toEqual({ allowed: true });
    });

    it('agrees exactly with the request guard on what the client is told', async () => {
      // Two enforcement points, one error contract. If either side is edited
      // alone the mobile client starts seeing two different suspension errors,
      // which is the drift ACCOUNT_SUSPENDED_CODE exists to prevent.
      const decision = await decideSessionCreate({ userId: suspendedId });
      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;

      const guardRejection = await new SuspendedAccountGuard()
        .canActivate({
          getType: () => 'http',
          switchToHttp: () => ({
            getRequest: () => ({ session: { user: { id: suspendedId } } }),
          }),
        } as never)
        .then(
          () => null,
          (err: { response: unknown }) => err.response,
        );

      expect(decision.error).toEqual(guardRejection);
    });
  });

  describe('reversal', () => {
    it('restores login the moment an admin reactivates the account', async () => {
      // Driven through the real admin service, not a hand-written row update:
      // the point is that the reversal a moderator actually performs is the one
      // that gives the person their sign-in back.
      await db.delete(userAccountStatus);
      await adminUsersService.suspend(admin, volunteerId, {
        reason: 'Mistake',
      });

      await expect(
        decideSessionCreate({ userId: volunteerId }),
      ).resolves.toMatchObject({
        allowed: false,
      });

      await adminUsersService.reactivate(admin, volunteerId, {
        reason: 'Appeal upheld',
      });

      await expect(
        decideSessionCreate({ userId: volunteerId }),
      ).resolves.toEqual({
        allowed: true,
      });
    });
  });

  describe('wiring — the hook in auth.ts actually runs the decision', () => {
    it('registers a session.create.before hook at all', () => {
      // The regression this whole file was written for: before it existed, the
      // hook could be deleted and nothing anywhere would notice.
      expect(typeof sessionCreateHook()).toBe('function');
    });

    it('lets a session be created for an active account', async () => {
      await expect(
        sessionCreateHook()!({ userId: noRowId }),
      ).resolves.toBeUndefined();
      expect(apiErrorFrom).not.toHaveBeenCalled();
    });

    it('throws for a suspended account, so no token or cookie is ever issued', async () => {
      await expect(
        sessionCreateHook()!({ userId: suspendedId }),
      ).rejects.toThrow(ACCOUNT_SUSPENDED_MESSAGE);
    });

    it('maps the decision onto APIError with the status and code unchanged', async () => {
      // 'FORBIDDEN' is Better Auth's own status name and resolves to HTTP 403 —
      // never 401, which a client cannot tell from an expired session.
      await expect(
        sessionCreateHook()!({ userId: suspendedId }),
      ).rejects.toBeDefined();

      expect(apiErrorFrom).toHaveBeenCalledTimes(1);
      expect(apiErrorFrom).toHaveBeenCalledWith('FORBIDDEN', {
        code: ACCOUNT_SUSPENDED_CODE,
        message: ACCOUNT_SUSPENDED_MESSAGE,
      });
    });
  });
});
