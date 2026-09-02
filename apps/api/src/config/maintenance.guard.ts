import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { getPlatformConfig } from './platform-settings';
import { decideWriteBlock, needsWriteBlockCheck } from './maintenance-mode';

/**
 * Enforces `maintenance_mode` and `read_only_mode` — the two settings
 * docs/webadmin/07-platform-settings.md §5A.3 is about:
 *
 *   "a switch that looks like a stop button and isn't one is worse than no
 *    switch."
 *
 * This file is what makes it a stop button. Every mutating HTTP request on a
 * citizen route is refused with 403 and a machine-readable code while either
 * switch is on.
 *
 * GLOBAL, not per-route, and for the same reason SuspendedAccountGuard is
 * (account-status/suspended-account.guard.ts, whose shape this mirrors): a
 * platform-wide stop that has to be remembered on each new controller is a stop
 * that will be missing from the endpoint somebody adds next month. There is no
 * opt-out decorator, because no citizen write should have one.
 *
 * WHAT IT MUST NEVER BLOCK, and why that is the highest-risk part of the whole
 * feature: `/admin/*` and the auth routes. `PATCH /admin/settings` is the only
 * way to switch maintenance back OFF, and `POST /api/auth/sign-in/email` is how
 * the operator gets the session to call it with. Blocking either would let an
 * operator brick the product with one toggle and no way back short of hand-run
 * SQL. The exemption rules live in maintenance-mode.ts as plain functions so
 * they are asserted directly by maintenance-mode.spec.ts rather than only
 * through a mocked execution context.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only HTTP is served by this app. Anything else (a future WS gateway)
    // would need its own notion of "a write" and must not silently inherit a
    // pass from here.
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<{
      method?: string;
      path?: string;
      originalUrl?: string;
      url?: string;
    }>();

    const candidate = {
      method: request.method ?? 'GET',
      path: request.path ?? request.originalUrl ?? request.url ?? '/',
      isAdminRoute: this.isAdminRoute(context),
    };

    // Fast path: no settings read at all for a GET, an admin route or an auth
    // route — which is nearly all traffic. `decideWriteBlock` re-applies the
    // same predicate, so this can only skip the query, never widen who passes.
    if (!needsWriteBlockCheck(candidate)) return true;

    const settings = await getPlatformConfig();
    const block = decideWriteBlock({ ...candidate, settings });
    if (!block) return true;

    // 403, never 503: this is a policy decision the server is making about the
    // request, and the mobile client keys on `code` to tell "the platform is
    // paused" apart from "your account is suspended" (ACCOUNT_SUSPENDED) and
    // from a plain permission failure. A 503 would also invite clients and
    // proxies to retry automatically, which is the opposite of what a
    // deliberate pause wants.
    throw new ForbiddenException(block);
  }

  /**
   * Whether the handler belongs to an admin controller.
   *
   * Read off the controller's own `@Controller()` path metadata rather than the
   * request URL, so the exemption survives anything that changes the URL
   * without changing what the route is — a `setGlobalPrefix()` in main.ts,
   * most obviously. "Every admin controller is mounted under `admin`" is not an
   * assumption: admin-module-guard.spec.ts walks AdminModule's controller list
   * and asserts exactly that, so this check and that suite fail together if it
   * ever stops being true.
   */
  private isAdminRoute(context: ExecutionContext): boolean {
    const controller = context.getClass();
    const path = Reflect.getMetadata(PATH_METADATA, controller) as
      string | string[] | undefined;

    const paths = Array.isArray(path) ? path : [path];

    return paths.some(
      (p) => typeof p === 'string' && (p === 'admin' || p.startsWith('admin/')),
    );
  }
}
