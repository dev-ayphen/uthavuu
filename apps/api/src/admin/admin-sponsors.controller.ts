import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import type { AdminRequestMeta } from './admin-request-meta';
import { AdminSponsorsService } from './admin-sponsors.service';
import { CreateSponsorDto } from './dto/create-sponsor.dto';
import { ListAdminSponsorsDto } from './dto/list-admin-sponsors.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Monetization -> Sponsors. Gated on `platform:manage`, matching Categories,
 * Support and Community Updates.
 *
 * `platform:manage` and NOT a new seventh permission key, which was an open
 * question rather than an oversight: the six keys in admin-rbac.ts come from
 * the console's own permission matrix (docs/webadmin/09-admins-and-audit.md
 * §2), and inventing `sponsors:manage` would add a flag no role holds, no seed
 * grants and no screen renders. Running a paid campaign in front of every
 * citizen is a platform decision, which is exactly what that permission means
 * here. Ops Admins get a 403 with ADMIN_MISSING_PERMISSION.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 * The class-level @AdminOnly() is what makes every route here gated by
 * construction — admin-module-guard.spec.ts walks AdminModule's controller list
 * and fails the suite if this decorator is ever dropped.
 */
@Controller('admin/sponsors')
@AdminOnly()
@RequireAdminPermissions('platform:manage')
export class AdminSponsorsController {
  constructor(private readonly sponsorsService: AdminSponsorsService) {}

  @Get()
  list(@Query() query: ListAdminSponsorsDto) {
    return this.sponsorsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sponsorsService.findOne(id);
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CreateSponsorDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.sponsorsService.create(admin, body, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateSponsorDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.sponsorsService.update(id, admin, body, meta);
  }

  // POST, not PATCH: pausing and activating are distinct audited acts with
  // their own catalogue keys, not field assignments. See the service.
  @Post(':id/pause')
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.sponsorsService.pause(id, admin, meta);
  }

  @Post(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.sponsorsService.activate(id, admin, meta);
  }

  // 204, matching DELETE /admin/community-updates/:id. The soft delete and its
  // audit row are the whole result; there is no restore endpoint and so nothing
  // to hand back.
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ): Promise<void> {
    await this.sponsorsService.delete(id, admin, meta);
  }
}
