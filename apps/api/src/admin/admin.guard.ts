import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminService } from './admin.service';
import { ADMIN_PERMISSIONS_METADATA } from './admin-rbac';
import type { AdminIdentity } from './admin-rbac';

/**
 * The admin gate.
 *
 * CLAUDE.md: "Admin role gate must come from the session, never a URL query
 * string — the prototype's `?role=super` fail-open pattern is exactly what NOT
 * to build." So this guard reads exactly one thing off the request — the user id
 * on the session the auth layer verified — and resolves the role from the
 * database. Query strings, request bodies, headers and any `request.user` a
 * caller might hope to influence are never consulted. There is no code path in
 * this file that grants access without an `admin_users` row.
 *
 * Every exit is either `true` or a throw. There is no `return true` fallthrough
 * at the bottom, and no default-allow branch to forget.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      session?: { user?: { id?: string } } | null;
      admin?: AdminIdentity;
    }>();

    // @thallesp/nestjs-better-auth's global AuthGuard has already run and set
    // `request.session` from the session cookie or Bearer token. Anonymous, an
    // expired session and a forged token all arrive here identically: as null.
    const userId = request.session?.user?.id;
    if (!userId) {
      throw new ForbiddenException({
        code: 'ADMIN_NO_SESSION',
        message: 'Admin access requires a signed-in admin session.',
      });
    }

    const admin = await this.adminService.findAdminIdentity(userId);
    if (!admin) {
      // A perfectly valid citizen session. Being signed in is not being staff.
      throw new ForbiddenException({
        code: 'ADMIN_NOT_AN_ADMIN',
        message: 'This account does not have admin access.',
      });
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ADMIN_PERMISSIONS_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (required?.length) {
      // AND, not OR (backend-agent.md §3.2). And deliberately no super-admin
      // bypass: `super_admin` passes because the seed grants it all six
      // permissions as real rows, not because the guard special-cases its name.
      // Revoking a permission from super_admin in the database therefore
      // actually revokes it.
      const missing = required.filter(
        (permission) => !admin.permissions.includes(permission),
      );
      if (missing.length > 0) {
        throw new ForbiddenException({
          code: 'ADMIN_MISSING_PERMISSION',
          message: `Missing admin permission: ${missing.join(', ')}`,
        });
      }
    }

    request.admin = admin;
    return true;
  }
}
