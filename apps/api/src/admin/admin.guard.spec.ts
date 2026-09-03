import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
// Imported from admin-rbac, not admin.decorators: the decorators file pulls in
// @thallesp/nestjs-better-auth, which is ESM-only and unloadable under this
// repo's CommonJS Jest transform.
import { ADMIN_PERMISSIONS_METADATA } from './admin-rbac';
import type { AdminIdentity } from './admin-rbac';

// The prototype this replaces gated the console on `?role=super` in the URL
// (docs/webadmin/02-dashboard-shell.md §3) and failed OPEN: every value except
// the literal 'ops' — including no value at all — was Super Admin. Every test
// below exists to prove this guard has the opposite failure mode.

const SUPER: AdminIdentity = {
  userId: 'u-super',
  name: 'Super Admin',
  email: 'admin@uthavu.org',
  role: { key: 'super_admin', label: 'Super Admin' },
  permissions: [
    'users:manage',
    'reports:manage',
    'comments:manage',
    'analytics:view',
    'platform:manage',
    'data:delete_all',
  ],
};

const OPS: AdminIdentity = {
  userId: 'u-ops',
  name: 'Ops Admin',
  email: 'ops@uthavu.org',
  role: { key: 'ops_admin', label: 'Ops Admin' },
  permissions: ['users:manage', 'reports:manage', 'comments:manage'],
};

/**
 * A request the way @thallesp/nestjs-better-auth's global AuthGuard leaves it:
 * `request.session` is the resolved Better Auth session, or null.
 */
function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function makeGuard(
  identity: AdminIdentity | null,
  requiredPermissions?: string[],
): { guard: AdminGuard; lookups: string[] } {
  const lookups: string[] = [];
  const adminService = {
    findAdminIdentity: (userId: string) => {
      lookups.push(userId);
      return Promise.resolve(identity);
    },
  };
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === ADMIN_PERMISSIONS_METADATA ? requiredPermissions : undefined,
  } as unknown as Reflector;

  return {
    guard: new AdminGuard(reflector, adminService),
    lookups,
  };
}

describe('AdminGuard', () => {
  describe('fails closed', () => {
    it('rejects a request with no session at all', async () => {
      const { guard, lookups } = makeGuard(SUPER);
      const ctx = makeContext({ session: null, query: {}, headers: {} });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      // Never even asked the DB — there is no user to ask about.
      expect(lookups).toEqual([]);
    });

    it('rejects a request where `session` is missing entirely (not merely null)', async () => {
      const { guard } = makeGuard(SUPER);
      await expect(
        guard.canActivate(makeContext({ query: {}, headers: {} })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an authenticated citizen who has no admin_users row', async () => {
      const { guard, lookups } = makeGuard(null);
      const ctx = makeContext({
        session: { user: { id: 'citizen-1' } },
        query: {},
        headers: {},
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(lookups).toEqual(['citizen-1']);
    });

    it('reports a distinct error code for each rejection reason', async () => {
      const noSession = makeGuard(SUPER).guard;
      await expect(
        noSession.canActivate(makeContext({ session: null })),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_NO_SESSION' },
      });

      const notAdmin = makeGuard(null).guard;
      await expect(
        notAdmin.canActivate(
          makeContext({ session: { user: { id: 'citizen-1' } } }),
        ),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_NOT_AN_ADMIN' } });

      const missingPermission = makeGuard(OPS, ['platform:manage']).guard;
      await expect(
        missingPermission.canActivate(
          makeContext({ session: { user: { id: 'u-ops' } } }),
        ),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_MISSING_PERMISSION' },
      });
    });
  });

  describe('the role comes from the session, never from the request', () => {
    it('does not grant anything for ?role=super in the query string', async () => {
      const { guard } = makeGuard(null);
      const ctx = makeContext({
        session: { user: { id: 'citizen-1' } },
        query: { role: 'super' },
        headers: {},
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('does not grant anything for ?role=super with no session', async () => {
      const { guard } = makeGuard(SUPER);
      const ctx = makeContext({
        session: null,
        query: { role: 'super' },
        headers: {},
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('ignores a role smuggled in the query, body, headers or a forged request.user', async () => {
      const { guard } = makeGuard(OPS, ['platform:manage']);
      const ctx = makeContext({
        session: { user: { id: 'u-ops' } },
        query: { role: 'super', isSuperAdmin: 'true' },
        body: { role: 'super_admin', permissions: ['platform:manage'] },
        headers: { 'x-admin-role': 'super_admin' },
        user: {
          id: 'u-ops',
          role: 'super_admin',
          permissions: ['platform:manage'],
        },
      });

      // The DB says this user is ops_admin. Nothing on the request can change that.
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('resolves the identity from session.user.id and nothing else', async () => {
      const { guard, lookups } = makeGuard(SUPER);
      const ctx = makeContext({
        session: { user: { id: 'u-super' } },
        query: { userId: 'someone-else' },
        headers: { 'x-user-id': 'someone-else' },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(lookups).toEqual(['u-super']);
    });
  });

  describe('permission checks', () => {
    it('admits any admin when the route requires no specific permission', async () => {
      const { guard } = makeGuard(OPS, undefined);
      await expect(
        guard.canActivate(makeContext({ session: { user: { id: 'u-ops' } } })),
      ).resolves.toBe(true);
    });

    it('admits an admin holding the required permission', async () => {
      const { guard } = makeGuard(OPS, ['reports:manage']);
      await expect(
        guard.canActivate(makeContext({ session: { user: { id: 'u-ops' } } })),
      ).resolves.toBe(true);
    });

    it('rejects an ops admin from a super-admin-only action', async () => {
      const { guard } = makeGuard(OPS, ['platform:manage']);
      await expect(
        guard.canActivate(makeContext({ session: { user: { id: 'u-ops' } } })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admits a super admin to the same super-admin-only action', async () => {
      const { guard } = makeGuard(SUPER, ['platform:manage']);
      await expect(
        guard.canActivate(
          makeContext({ session: { user: { id: 'u-super' } } }),
        ),
      ).resolves.toBe(true);
    });

    it('requires ALL listed permissions, not any of them', async () => {
      const { guard } = makeGuard(OPS, ['reports:manage', 'data:delete_all']);
      await expect(
        guard.canActivate(makeContext({ session: { user: { id: 'u-ops' } } })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('has no super-admin bypass — a super admin lacking a permission is still refused', async () => {
      const stripped: AdminIdentity = {
        ...SUPER,
        permissions: ['users:manage'],
      };
      const { guard } = makeGuard(stripped, ['platform:manage']);

      await expect(
        guard.canActivate(
          makeContext({ session: { user: { id: 'u-super' } } }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('attaches the resolved identity to the request for @CurrentAdmin()', async () => {
    const { guard } = makeGuard(SUPER);
    const request: Record<string, unknown> = {
      session: { user: { id: 'u-super' } },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.admin).toEqual(SUPER);
  });
});
