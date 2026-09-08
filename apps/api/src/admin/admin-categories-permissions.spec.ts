/**
 * The read/write permission split on `/admin/report-categories`.
 *
 * WHY THIS SUITE EXISTS. The gate on this controller is arranged so that the
 * CLASS carries the strict permission and exactly one METHOD opts down to a
 * wider one (see admin-categories.controller.ts). That arrangement is correct
 * but not self-evident — `getAllAndOverride` REPLACES rather than merges, so the
 * method-level decorator on `list()` WIDENS its gate, which is the opposite of
 * what a method-level permission decorator usually does. A refactor that
 * "tidies" this by moving decorators around could silently drop `platform:manage`
 * from a write, and nothing else in the suite would notice.
 *
 * So every route's RESOLVED permission is asserted here, through the real
 * `Reflector` and the real `AdminGuard` rather than through a restatement of how
 * they are believed to behave.
 *
 * The library mock is the same one admin-module-guard.spec.ts uses and for the
 * same reason: admin.decorators.ts imports @thallesp/nestjs-better-auth, which
 * ships ESM only and cannot be loaded by this repo's CommonJS Jest transform.
 * AdminGuard and Reflector below are the real ones.
 */
jest.mock('@thallesp/nestjs-better-auth', () => ({
  OptionalAuth: () => () => undefined,
  Session: () => () => undefined,
  AuthModule: { forRoot: () => ({ module: class {} }) },
}));

import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminGuard } from './admin.guard';
import {
  ADMIN_PERMISSIONS_METADATA,
  ADMIN_ROLE_PERMISSIONS,
} from './admin-rbac';
import type { AdminService } from './admin.service';

type RouteName = 'list' | 'create' | 'update' | 'remove';

const ROUTES: RouteName[] = ['list', 'create', 'update', 'remove'];

/**
 * The route handler, as Nest's Reflector addresses it.
 *
 * `unbound-method` is disabled deliberately and narrowly: this reference is a
 * METADATA KEY, looked up by identity and never called, so there is no `this`
 * to lose. That is exactly how `context.getHandler()` is used at runtime.
 */
function handlerFor(route: RouteName): (...args: never[]) => unknown {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return AdminCategoriesController.prototype[route];
}

function contextFor(route: RouteName, request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handlerFor(route),
    getClass: () => AdminCategoriesController,
  } as unknown as ExecutionContext;
}

/** An AdminService stub that grants exactly the permissions a role really has. */
function adminServiceFor(roleKey: 'super_admin' | 'ops_admin') {
  return {
    findAdminIdentity: () =>
      Promise.resolve({
        userId: 'admin-1',
        name: 'Spec Admin',
        email: 'spec@uthavu.org',
        role: { key: roleKey, label: roleKey },
        // Straight from the RBAC catalogue the seed writes, not a hand-picked
        // list — so a change to what ops_admin holds is felt here.
        permissions: [...ADMIN_ROLE_PERMISSIONS[roleKey]],
      }),
  } as unknown as AdminService;
}

const SESSION = { session: { user: { id: 'admin-1' } } };

describe('AdminCategoriesController permissions', () => {
  const reflector = new Reflector();

  const resolvedPermissions = (route: RouteName) =>
    reflector.getAllAndOverride<string[] | undefined>(
      ADMIN_PERMISSIONS_METADATA,
      [handlerFor(route), AdminCategoriesController],
    );

  describe('the resolved gate on each route', () => {
    it('reads with reports:manage — the permission both roles hold', () => {
      expect(resolvedPermissions('list')).toEqual(['reports:manage']);
    });

    it.each(['create', 'update', 'remove'] as const)(
      'writes with platform:manage (%s)',
      (route) => {
        expect(resolvedPermissions(route)).toEqual(['platform:manage']);
      },
    );

    it('gates every route — none resolves to undefined', () => {
      // The failure this catches is a route added without a decorator on a
      // controller whose class-level default someone has since removed.
      for (const route of ROUTES) {
        expect(resolvedPermissions(route)?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('an ops admin, through the real AdminGuard', () => {
    const guard = new AdminGuard(reflector, adminServiceFor('ops_admin'));

    it('CAN now list categories — the Reports filter depends on it', async () => {
      await expect(
        guard.canActivate(contextFor('list', { ...SESSION })),
      ).resolves.toBe(true);
    });

    it.each(['create', 'update', 'remove'] as const)(
      'still CANNOT %s — the write gate did not widen with the read gate',
      async (route) => {
        const refusal = await guard
          .canActivate(contextFor(route, { ...SESSION }))
          .then(
            () => null,
            (error: unknown) => error,
          );

        expect(refusal).toBeInstanceOf(ForbiddenException);

        const body = (refusal as ForbiddenException).getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('ADMIN_MISSING_PERMISSION');
        // Names the permission it lacked, so the console can say which one.
        expect(body.message).toContain('platform:manage');
      },
    );
  });

  describe('a super admin, through the real AdminGuard', () => {
    const guard = new AdminGuard(reflector, adminServiceFor('super_admin'));

    it.each(ROUTES)('passes %s', async (route) => {
      await expect(
        guard.canActivate(contextFor(route, { ...SESSION })),
      ).resolves.toBe(true);
    });
  });

  describe('the catalogue this split depends on', () => {
    it('ops_admin holds reports:manage and not platform:manage', () => {
      // If either of these ever changes, the arrangement above stops meaning
      // what its comment says it means — so it is asserted rather than assumed.
      expect(ADMIN_ROLE_PERMISSIONS.ops_admin).toContain('reports:manage');
      expect(ADMIN_ROLE_PERMISSIONS.ops_admin).not.toContain('platform:manage');
    });

    it('super_admin holds both', () => {
      expect(ADMIN_ROLE_PERMISSIONS.super_admin).toContain('reports:manage');
      expect(ADMIN_ROLE_PERMISSIONS.super_admin).toContain('platform:manage');
    });
  });
});
