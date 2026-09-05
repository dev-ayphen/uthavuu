import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { AdminReportPhotosService } from './admin-report-photos.service';
import { ListReportPhotosDto } from './dto/list-report-photos.dto';
import { ReportPhotoSummaryDto } from './dto/report-photo-summary.dto';
import {
  ApproveReportPhotoDto,
  RefuseReportPhotoDto,
} from './dto/moderate-report-photo.dto';
import { RequestMeta } from './admin-request-meta';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';

/**
 * Reports -> Photo review.
 *
 * `reports:manage` on every route, which both roles hold — moderating what
 * citizens post is the ops admin's job, and this is the sharpest instance of it.
 * The permission is repeated per route rather than declared once on the class
 * because that is how every other admin controller in this codebase reads, and a
 * class-level default is the kind of thing a later route quietly opts out of by
 * being added below it.
 *
 * THE `/file` ROUTE IS A SECURITY BOUNDARY, NOT A CONVENIENCE. `main.ts` serves
 * UPLOADS_DIR as static Express outside every Nest guard, so anything in there
 * is world-readable with no revocation. A photo awaiting moderation is
 * deliberately NOT in there — it sits in QUARANTINE_DIR, which no middleware is
 * mounted on — and this handler is the only path from those bytes to a human.
 * Its gate is `@AdminOnly()` plus `reports:manage`, the same gate as the
 * decisions themselves, because seeing an unpublished photo is exactly as
 * privileged as deciding on one.
 */
@Controller('admin/report-photos')
@AdminOnly()
export class AdminReportPhotosController {
  constructor(private readonly service: AdminReportPhotosService) {}

  @Get()
  @RequireAdminPermissions('reports:manage')
  list(@Query() query: ListReportPhotosDto) {
    return this.service.list(query);
  }

  /**
   * The sidebar badge and the queue's summary cards.
   *
   * DECLARED BEFORE `:id`, and that ordering is load-bearing: Nest matches
   * routes in declaration order, so `@Get(':id')` above this would swallow
   * `/summary` as an id — and with ParseUUIDPipe on it, the console's badge
   * would come back as a 400 about a malformed uuid.
   */
  @Get('summary')
  @RequireAdminPermissions('reports:manage')
  summary(@Query() query: ReportPhotoSummaryDto) {
    return this.service.summary(query);
  }

  /**
   * ParseUUIDPipe, as on /admin/reports/:id and for the same reason:
   * `photo_uploads.id` is a real uuid column, so a malformed id becomes a 400
   * here instead of a database error further in.
   */
  @Get(':id')
  @RequireAdminPermissions('reports:manage')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /**
   * Streams the quarantined image.
   *
   * `@Res()` puts this handler in Express's hands, which is what lets it set
   * caching headers and send a file — at the cost of bypassing the global
   * response interceptor. That is correct here: an image is not JSON and must
   * not be wrapped in `{ statusCode, data }`.
   */
  @Get(':id/file')
  @RequireAdminPermissions('reports:manage')
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { path, mimeType } = await this.service.fileFor(id);

    res.type(mimeType);
    // Private, no-store — the same header the citizen's own quarantine route
    // sets, for the same reason: this image may be refused minutes from now, and
    // a copy sitting in a proxy cache would outlive the decision. On this route
    // it also keeps an unpublished photo out of a shared corporate cache that
    // every colleague, admin or not, can read.
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path);
  }

  /**
   * The three decisions. Named routes rather than one PATCH with a verdict
   * field, matching AdminReportsController: each has its own preconditions, its
   * own audit action and its own notification behaviour, and collapsing them
   * would hide all three.
   *
   * They return the photo's full detail so the console can re-render from the
   * response — including `report.photos`, which is what tells the moderator
   * whether that click actually published the report or merely resolved one of
   * several photos still holding it.
   *
   * `@Req()` on approve alone: publishing has to build the stored photo URL, and
   * buildUploadUrl() derives its origin from the request against this
   * deployment's declared origins. Threading the real request through is what
   * keeps that one URL-building rule in one place — see upload-url.ts, where
   * both a broken-image bug and a Host-header injection came from a second copy
   * of it.
   */
  @Post(':id/approve')
  @RequireAdminPermissions('reports:manage')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveReportPhotoDto,
    @CurrentAdmin() admin: AdminIdentity,
    @Req() req: Request,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.service.approve(admin, id, dto, req, meta);
  }

  @Post(':id/reject')
  @RequireAdminPermissions('reports:manage')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuseReportPhotoDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.service.reject(admin, id, dto, meta);
  }

  @Post(':id/request-new')
  @RequireAdminPermissions('reports:manage')
  requestNew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuseReportPhotoDto,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.service.requestNew(admin, id, dto, meta);
  }
}
