/**
 * The gate on the photo review routes.
 *
 * WHY THIS SUITE EXISTS SEPARATELY FROM admin-module-guard.spec.ts. That one
 * proves every registered controller carries AdminGuard at CLASS level, which is
 * the structural guarantee ADR 0009 rests on. It says nothing about the
 * per-route permission, and on this controller the per-route permission is the
 * whole security model: `GET /admin/report-photos/:id/file` is the ONLY path
 * from a quarantined photo's bytes to a human being. main.ts serves UPLOADS_DIR
 * as static Express outside every Nest guard precisely so avatars are fetchable;
 * an unpublished report photo is deliberately not in there, and this handler is
 * what stands in its place. A missing decorator on that one route out of six
 * would publish an unmoderated image to any signed-in citizen, and nothing else
 * in the codebase would notice.
 *
 * The guard under test is the real AdminGuard, run against the real metadata the
 * decorators left on the real handlers — not a re-declaration of what the
 * decorators are believed to say.
 *
 * The library mock is the same one admin-module-guard.spec.ts needs and for the
 * same reason: admin.decorators.ts imports @thallesp/nestjs-better-auth, which
 * ships ESM only and cannot be loaded by this repo's CommonJS Jest transform.
 */
/**
 * `unbound-method` is disabled for the file, not silenced case by case.
 *
 * The rule guards against passing a method around and losing `this`. That is
 * exactly what this suite does ON PURPOSE and never regrets: it reads the
 * metadata the decorators attached to each handler FUNCTION, and hands the same
 * unbound function to AdminGuard as `context.getHandler()` — which is precisely
 * what Nest itself passes at runtime. Binding them would test a different
 * object than the one the guard actually receives. No handler here is ever
 * called.
 */
/* eslint-disable @typescript-eslint/unbound-method */

jest.mock('@thallesp/nestjs-better-auth', () => ({
  OptionalAuth: () => () => undefined,
  Session: () => () => undefined,
  AuthModule: { forRoot: () => ({ module: class {} }) },
}));

import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminGuard } from './admin.guard';
import { ADMIN_PERMISSIONS_METADATA } from './admin-rbac';
import type { AdminIdentity } from './admin-rbac';
import { AdminReportPhotosController } from './admin-report-photos.controller';

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

/**
 * An admin who holds real console access and NOT `reports:manage`.
 *
 * Not a role this product ships today — both seeded roles hold it — which is
 * exactly why it has to be tested. The permission rows are database rows an
 * operator can revoke without a redeploy (admin-rbac.ts), so "every admin has
 * it in practice" must never be what keeps these routes closed.
 */
const NO_REPORTS: AdminIdentity = {
  userId: 'u-limited',
  name: 'Analytics Only',
  email: 'analytics@uthavu.org',
  role: { key: 'ops_admin', label: 'Ops Admin' },
  permissions: ['analytics:view'],
};

type Handler = (...args: never[]) => unknown;

const ROUTES: ReadonlyArray<readonly [string, Handler]> = [
  ['list', AdminReportPhotosController.prototype.list],
  ['summary', AdminReportPhotosController.prototype.summary],
  ['findOne', AdminReportPhotosController.prototype.findOne],
  ['file', AdminReportPhotosController.prototype.file],
  ['approve', AdminReportPhotosController.prototype.approve],
  ['reject', AdminReportPhotosController.prototype.reject],
  ['requestNew', AdminReportPhotosController.prototype.requestNew],
];

function makeContext(
  request: Record<string, unknown>,
  handler: Handler,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => AdminReportPhotosController,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function makeGuard(identity: AdminIdentity | null): AdminGuard {
  const adminService = {
    findAdminIdentity: () => Promise.resolve(identity),
  };
  // The REAL Reflector, reading the REAL metadata the decorators emitted. A
  // stub here would be this suite asserting its own assumptions.
  return new AdminGuard(new Reflector(), adminService);
}

describe('AdminReportPhotosController gating', () => {
  it.each(ROUTES.map(([name, handler]) => [name, handler] as const))(
    '%s declares reports:manage',
    (_name, handler) => {
      const required = Reflect.getMetadata(
        ADMIN_PERMISSIONS_METADATA,
        handler,
      ) as string[] | undefined;
      expect(required).toEqual(['reports:manage']);
    },
  );

  it.each(ROUTES.map(([name, handler]) => [name, handler] as const))(
    '%s refuses an admin without reports:manage',
    async (_name, handler) => {
      const context = makeContext(
        { session: { user: { id: 'u-limited' } } },
        handler,
      );
      await expect(
        makeGuard(NO_REPORTS).canActivate(context),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_MISSING_PERMISSION' },
      });
    },
  );

  it('refuses an UNAUTHENTICATED caller on the file route', async () => {
    // The bytes of a photo no moderator has cleared. There is no public URL for
    // them by design, so an anonymous request here is the whole attack surface.
    const context = makeContext(
      { session: null },
      AdminReportPhotosController.prototype.file,
    );
    const guard = makeGuard(SUPER);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'ADMIN_NO_SESSION' },
    });
  });

  it('refuses a signed-in CITIZEN on the file route', async () => {
    // A perfectly valid session belonging to somebody who is not staff — the
    // case a route protected by "you must be logged in" would let through.
    const context = makeContext(
      { session: { user: { id: 'citizen-1' } } },
      AdminReportPhotosController.prototype.file,
    );
    await expect(makeGuard(null).canActivate(context)).rejects.toMatchObject({
      response: { code: 'ADMIN_NOT_AN_ADMIN' },
    });
  });

  it('admits an admin who holds reports:manage', async () => {
    // The other half: a gate that refused everyone would pass every test above
    // and ship a console nobody can use.
    for (const [, handler] of ROUTES) {
      const request: Record<string, unknown> = {
        session: { user: { id: 'u-super' } },
      };
      await expect(
        makeGuard(SUPER).canActivate(makeContext(request, handler)),
      ).resolves.toBe(true);
      expect(request.admin).toMatchObject({ userId: 'u-super' });
    }
  });

  it('is mounted where the console expects it', () => {
    expect(Reflect.getMetadata('path', AdminReportPhotosController)).toBe(
      'admin/report-photos',
    );
  });
});
