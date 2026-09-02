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
import { AdminBroadcastsService } from './admin-broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import {
  DeleteBroadcastQueryDto,
  ListBroadcastsDto,
} from './dto/list-broadcasts.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Community -> Broadcasts. Gated on `platform:manage`, matching Announcements,
 * Categories and Support — and the case is stronger here than for any of them: a
 * broadcast writes a notification into every selected citizen's alert list and
 * lights up their phone, irreversibly. That is a platform decision, not a
 * moderation one. Ops Admins get a 403 with ADMIN_MISSING_PERMISSION.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 * The class-level @AdminOnly() is what makes every route here gated by
 * construction — admin-module-guard.spec.ts walks AdminModule's controller list
 * and fails the suite if this decorator is ever dropped.
 */
@Controller('admin/broadcasts')
@AdminOnly()
@RequireAdminPermissions('platform:manage')
export class AdminBroadcastsController {
  constructor(private readonly broadcastsService: AdminBroadcastsService) {}

  @Get()
  list(@Query() query: ListBroadcastsDto) {
    return this.broadcastsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.broadcastsService.findOne(id);
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CreateBroadcastDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.broadcastsService.create(admin, body, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateBroadcastDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.broadcastsService.update(id, admin, body, meta);
  }

  /**
   * Fans the broadcast out. IRREVERSIBLE, and the only route that notifies
   * anybody.
   *
   * POST rather than a PATCHable `status` field, and the reason is sharper than
   * the equivalent choice on Announcements: this is not merely a distinct
   * audited act, it is an act with no undo. A `PATCH { status: 'sent' }` would
   * make notifying the entire user base look like a field assignment — and would
   * sit in the audit trail as `broadcast.update`, indistinguishable from fixing a
   * typo.
   *
   * Returns the updated broadcast including `recipientCount` and
   * `deliveredCount`. Those two are DIFFERENT MEASUREMENTS (people reached
   * in-app vs FCM sends accepted) — see the service's `toResponse` and the
   * column comments in db/schema/broadcasts-schema.ts before rendering them
   * side by side.
   */
  @Post(':id/send')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.broadcastsService.send(id, admin, meta);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.broadcastsService.cancel(id, admin, meta);
  }

  /**
   * 204, matching DELETE /admin/community-updates/:id and DELETE /users/me. The
   * soft delete and its audit row are the whole result; there is no restore
   * endpoint and so nothing to hand back.
   *
   * Draft only — the service refuses anything else. `?reason=` is optional; see
   * DeleteBroadcastQuerySchema for why it is a query parameter rather than a
   * required body.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Query() query: DeleteBroadcastQueryDto,
    @RequestMeta() meta: AdminRequestMeta,
  ): Promise<void> {
    await this.broadcastsService.delete(id, admin, meta, query.reason);
  }
}
