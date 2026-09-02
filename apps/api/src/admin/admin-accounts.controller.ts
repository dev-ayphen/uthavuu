import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import { AdminAccountsService } from './admin-accounts.service';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import {
  UpdateAdminAccountDto,
  UpdateMyAdminProfileDto,
} from './dto/update-admin-account.dto';
import {
  ChangeMyPasswordDto,
  ResetAdminPasswordDto,
} from './dto/admin-account-password.dto';
import {
  ReactivateAdminAccountDto,
  SuspendAdminAccountDto,
} from './dto/suspend-admin-account.dto';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';

/**
 * Platform -> Admins: the console managing its own operators.
 *
 * `@Controller('admin')` rather than `@Controller('admin/admins')` because this
 * class owns routes under two prefixes — `/admin/admins/*` (acting on the admin
 * roster) and `/admin/me/*` (acting on yourself). They belong together: the
 * self routes exist as the safe counterparts to `reset-password` and
 * `PATCH /admin/admins/:id`, and splitting them across two files would let one
 * grow a different permission story from the other.
 *
 * `@RequireAdminPermissions` is per-route, NOT on the class, and that is the
 * point of this file's shape. Every route that touches ANOTHER admin is
 * `platform:manage`; the two `/admin/me/*` routes deliberately are not, so an
 * Ops Admin can edit their own profile and rotate their own password without
 * being able to see — let alone edit — the admin directory. That split is the
 * owner's permission table, expressed as decorators. A class-level decorator
 * could not have said it, and putting the self routes in another controller
 * would have made the difference easy to forget.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 * The class-level @AdminOnly() is what makes every route gated by construction —
 * admin-module-guard.spec.ts walks AdminModule's controller list and fails the
 * suite if it is ever dropped.
 *
 * No ParseUUIDPipe on `:id`, deliberately, for the reason AdminUsersController
 * gives: `user.id` is a Better Auth text id, not a UUID, and parsing it as one
 * would 400 every account that was not created by uuidv7.
 */
@Controller('admin')
@AdminOnly()
export class AdminAccountsController {
  constructor(private readonly accountsService: AdminAccountsService) {}

  /**
   * GET /admin/admins — the admin directory.
   *
   * Moved here from AdminController so the list and the detail route come from
   * one projection and one gate. They used to be two queries returning
   * different fields, and the console cannot render a working Suspend /
   * Reactivate menu off a row with no `status`.
   *
   * Super admins only. docs/webadmin/09-admins-and-audit.md gap #2: in the
   * prototype "an Ops Moderator — or an unauthenticated visitor — can create a
   * Super Admin", because that tab had no role guard at all. This is that
   * guard, on the server, where it cannot be bypassed by editing the URL.
   */
  @Get('admins')
  @RequireAdminPermissions('platform:manage')
  list(@CurrentAdmin() admin: AdminIdentity) {
    return this.accountsService.list(admin);
  }

  /** GET /admin/admins/:id — one admin, with status, last login and the UI flags. */
  @Get('admins/:id')
  @RequireAdminPermissions('platform:manage')
  findOne(@CurrentAdmin() admin: AdminIdentity, @Param('id') id: string) {
    return this.accountsService.findOne(admin, id);
  }

  /** POST /admin/admins — provision a new admin (user + credential + grant). */
  @Post('admins')
  @RequireAdminPermissions('platform:manage')
  create(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CreateAdminAccountDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.accountsService.create(admin, body, meta);
  }

  /** PATCH /admin/admins/:id — name, email and/or role. */
  @Patch('admins/:id')
  @RequireAdminPermissions('platform:manage')
  update(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateAdminAccountDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.accountsService.update(admin, id, body, meta);
  }

  /**
   * POST /admin/admins/:id/reset-password — 204.
   *
   * 204 with no body is the contract, and it is also the safety property: there
   * is nothing to accidentally start returning. The new password went one way,
   * from the caller to the hasher.
   */
  @Post('admins/:id/reset-password')
  @RequireAdminPermissions('platform:manage')
  @HttpCode(204)
  async resetPassword(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: ResetAdminPasswordDto,
    @RequestMeta() meta: AdminRequestMeta,
  ): Promise<void> {
    await this.accountsService.resetPassword(admin, id, body, meta);
  }

  /**
   * POST /admin/admins/:id/suspend — block this admin's access.
   *
   * POST and two named routes rather than one `PATCH { status }`, matching
   * /admin/users: suspend and reactivate have different preconditions and
   * different audit actions, and a single status field would hide both.
   */
  @Post('admins/:id/suspend')
  @RequireAdminPermissions('platform:manage')
  suspend(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: SuspendAdminAccountDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.accountsService.suspend(admin, id, body, meta);
  }

  /** POST /admin/admins/:id/reactivate — lift a suspension. */
  @Post('admins/:id/reactivate')
  @RequireAdminPermissions('platform:manage')
  reactivate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: ReactivateAdminAccountDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.accountsService.reactivate(admin, id, body, meta);
  }

  /**
   * DELETE /admin/admins/:id — 204. REVOKES ADMIN ACCESS.
   *
   * It deletes the `admin_users` row. The person's `user` account, reports and
   * mission history are untouched — see the service method's comment before
   * changing anything here.
   */
  @Delete('admins/:id')
  @RequireAdminPermissions('platform:manage')
  @HttpCode(204)
  async revoke(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ): Promise<void> {
    await this.accountsService.revoke(admin, id, meta);
  }

  /**
   * PATCH /admin/me — edit your OWN name and email. ANY admin, including Ops.
   *
   * The owner's permission table grants "edit own profile" to both roles, while
   * "edit another admin" is Super-Admin-only — which is exactly the split
   * between this route and `PATCH /admin/admins/:id`. The body has no `roleKey`
   * field at all, so no admin can change their own role through it.
   */
  @Patch('me')
  updateMyProfile(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateMyAdminProfileDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.accountsService.updateMyProfile(admin, body, meta);
  }

  /**
   * POST /admin/me/change-password — 204. ANY admin, including Ops.
   *
   * No @RequireAdminPermissions, on purpose: reaching this route already proves
   * admin status (AdminGuard), and the account being changed is the caller's
   * own — identified from the guard-resolved session, never from the body, so
   * there is no id a caller could substitute to aim it at somebody else.
   */
  @Post('me/change-password')
  @HttpCode(204)
  async changeMyPassword(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: ChangeMyPasswordDto,
    @RequestMeta() meta: AdminRequestMeta,
  ): Promise<void> {
    await this.accountsService.changeMyPassword(admin, body, meta);
  }
}
