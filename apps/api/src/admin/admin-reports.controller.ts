import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { AdminReportsService } from './admin-reports.service';
import { ListAdminReportsDto } from './dto/list-admin-reports.dto';
import { ModerateReportDto } from './dto/moderate-report.dto';
import { AdminReportModerationService } from './admin-report-moderation.service';
import { RequestMeta } from './admin-request-meta';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';

/**
 * Reports -> /reports, /reports/:id.
 *
 * `reports:manage` on both, which both roles hold: ops admins moderate reports,
 * that is the job. The role split in this product is analytics and platform
 * administration, not read access to the queue.
 */
@Controller('admin/reports')
@AdminOnly()
export class AdminReportsController {
  constructor(
    private readonly reportsService: AdminReportsService,
    private readonly moderationService: AdminReportModerationService,
  ) {}

  @Get()
  @RequireAdminPermissions('reports:manage')
  list(@Query() query: ListAdminReportsDto) {
    return this.reportsService.list(query);
  }

  /**
   * ParseUUIDPipe here but NOT on /admin/users/:id — `reports.id` is a real
   * uuid column, while `user.id` is Better Auth's text id. Parsing the right
   * one turns a malformed id into a 400 instead of a database error.
   */
  @Get(':id')
  @RequireAdminPermissions('reports:manage')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.findOne(id);
  }

  /**
   * The four moderation actions. Named routes rather than one PATCH with a
   * status field: each has its own preconditions, its own audit action and its
   * own notification behaviour, and collapsing them would hide all three.
   *
   * They return the full report detail, so the console can re-render from the
   * response instead of refetching — and so the caller can see the DERIVED
   * status that resulted, which is not always the one they asked for (reopening
   * a report past its expiry_at yields 'expired', not 'open').
   */
  @Post(':id/close')
  @RequireAdminPermissions('reports:manage')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReportDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.moderationService.close(admin, id, dto, meta);
  }

  @Post(':id/reopen')
  @RequireAdminPermissions('reports:manage')
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReportDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.moderationService.reopen(admin, id, dto, meta);
  }

  @Post(':id/hide')
  @RequireAdminPermissions('reports:manage')
  hide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReportDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.moderationService.hide(admin, id, dto, meta);
  }

  @Post(':id/reinstate')
  @RequireAdminPermissions('reports:manage')
  reinstate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateReportDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.moderationService.reinstate(admin, id, dto, meta);
  }
}
