import {
  SetMetadata,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';
import { AdminGuard } from './admin.guard';
import { ADMIN_PERMISSIONS_METADATA } from './admin-rbac';
import type { AdminIdentity, AdminPermissionKey } from './admin-rbac';

/**
 * Marks a controller as admin-only. Apply it to the CLASS, once.
 *
 * It bundles two things that must never be applied separately:
 *
 *   UseGuards(AdminGuard) — the gate.
 *   OptionalAuth()        — tells the library's global AuthGuard to resolve the
 *                           session onto the request and then step aside,
 *                           instead of 401-ing first.
 *
 * The second one looks like a loosening and is not. The global guard attaches
 * `request.session` (null when absent) *before* it consults OPTIONAL, so
 * AdminGuard still sees exactly the same verified session it would otherwise —
 * it just becomes the single authority on admin routes, and every rejection
 * leaves as one 403 rather than 401-for-anonymous / 403-for-everything-else.
 * A prober therefore cannot use the status code to learn whether an admin route
 * exists, and the console gets one failure branch to handle. Callers that need
 * to tell the cases apart read `code` in the body (ADMIN_NO_SESSION /
 * ADMIN_NOT_AN_ADMIN / ADMIN_MISSING_PERMISSION).
 *
 * Bundling matters more than either half: applying OptionalAuth without
 * AdminGuard would publish an admin controller to the world. Because this is
 * one decorator, that state is not reachable.
 */
export const AdminOnly = () =>
  applyDecorators(OptionalAuth(), UseGuards(AdminGuard));

/**
 * Narrows a single route to admins holding ALL of the listed permissions.
 * Without it a route is open to any admin, which is the correct default for
 * things both roles do (the dashboard). With it, `platform:manage` is the
 * super-admin-only gate.
 *
 * Metadata only — it does nothing on a controller that isn't already @AdminOnly().
 */
export const RequireAdminPermissions = (...permissions: AdminPermissionKey[]) =>
  SetMetadata(ADMIN_PERMISSIONS_METADATA, permissions);

/**
 * The identity AdminGuard resolved for this request. Only ever populated by the
 * guard, so a route can't receive one without having passed it.
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminIdentity => {
    const request = context
      .switchToHttp()
      .getRequest<{ admin: AdminIdentity }>();
    return request.admin;
  },
);
