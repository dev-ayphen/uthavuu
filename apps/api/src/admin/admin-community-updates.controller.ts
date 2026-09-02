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
import { AdminCommunityUpdatesService } from './admin-community-updates.service';
import { CreateCommunityUpdateDto } from './dto/create-community-update.dto';
import { ListCommunityUpdatesDto } from './dto/list-community-updates.dto';
import { UpdateCommunityUpdateDto } from './dto/update-community-update.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Community -> Updates. Gated on `platform:manage`, matching Categories and
 * Support: an announcement goes to every citizen in the country the moment it
 * is published, which is a platform decision rather than a moderation one. Ops
 * Admins get a 403 with ADMIN_MISSING_PERMISSION.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 * The class-level @AdminOnly() is what makes every route here gated by
 * construction — admin-module-guard.spec.ts walks AdminModule's controller list
 * and fails the suite if this decorator is ever dropped.
 */
@Controller('admin/community-updates')
@AdminOnly()
@RequireAdminPermissions('platform:manage')
export class AdminCommunityUpdatesController {
  constructor(
    private readonly communityUpdatesService: AdminCommunityUpdatesService,
  ) {}

  @Get()
  list(@Query() query: ListCommunityUpdatesDto) {
    return this.communityUpdatesService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.communityUpdatesService.findOne(id);
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CreateCommunityUpdateDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.communityUpdatesService.create(admin, body, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateCommunityUpdateDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.communityUpdatesService.update(id, admin, body, meta);
  }

  // POST, not PATCH: publishing is a distinct audited act with its own
  // catalogue key, not a field assignment. See the service's class comment.
  @Post(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.communityUpdatesService.publish(id, admin, meta);
  }

  @Post(':id/archive')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.communityUpdatesService.archive(id, admin, meta);
  }

  // 204, matching DELETE /users/me. The soft delete and its audit row are the
  // whole result; there is no restore endpoint and so nothing to hand back.
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ): Promise<void> {
    await this.communityUpdatesService.delete(id, admin, meta);
  }
}
