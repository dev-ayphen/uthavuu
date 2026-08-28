import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminOnly, RequireAdminPermissions } from './admin.decorators';
import { AdminUsersService } from './admin-users.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ReactivateUserDto, SuspendUserDto } from './dto/suspend-user.dto';
import { CurrentAdmin } from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';

/**
 * Users -> /users, /users/:id.
 *
 * A separate controller from AdminController, and every admin controller in this
 * module carries its own class-level @AdminOnly(). That is the one thing that
 * must never be forgotten here — admin-module-guard.spec.ts asserts it for every
 * controller the module registers, so omitting it fails the suite rather than
 * publishing an ungated admin route.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no logic.
 */
@Controller('admin/users')
@AdminOnly()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  /**
   * GET /admin/users — the citizen directory, paginated and searchable.
   *
   * `users:manage` rather than a read-specific permission: the RBAC catalogue
   * has six coarse capabilities (admin-rbac.ts), and both roles hold this one.
   * Ops admins are expected to look users up; only `analytics:view` and
   * `platform:manage` separate the roles.
   */
  @Get()
  @RequireAdminPermissions('users:manage')
  list(@Query() query: ListAdminUsersDto) {
    return this.usersService.list(query);
  }

  /**
   * GET /admin/users/:id — profile, account status, activity counts, and the
   * ten most recent reports and missions.
   *
   * No ParseUUIDPipe on this one, deliberately: `user.id` is a Better Auth
   * text id (`35bxKJ4e2RIJpSMcV2SB7DcfJUTwamDc`), not a UUID. Parsing it as one
   * would 400 every real citizen and only let the seeded admin accounts through.
   */
  @Get(':id')
  @RequireAdminPermissions('users:manage')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * POST /admin/users/:id/suspend — block login and authenticated requests.
   *
   * POST rather than PATCH, and two named routes rather than one status field:
   * suspend and reactivate have different bodies (reason required vs optional),
   * different preconditions, and different audit actions. A single
   * `PATCH { status }` would hide all three differences behind one handler.
   */
  @Post(':id/suspend')
  @RequireAdminPermissions('users:manage')
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.usersService.suspend(admin, id, dto, meta);
  }

  /** POST /admin/users/:id/reactivate — lift a suspension. */
  @Post(':id/reactivate')
  @RequireAdminPermissions('users:manage')
  reactivate(
    @Param('id') id: string,
    @Body() dto: ReactivateUserDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.usersService.reactivate(admin, id, dto, meta);
  }
}
