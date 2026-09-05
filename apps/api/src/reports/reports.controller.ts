import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { auth } from '../auth/auth';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { AddPhotoDto } from './dto/add-photo.dto';
import { ReplaceHeldPhotosDto } from './dto/replace-held-photos.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { ReportsSummaryDto } from './dto/reports-summary.dto';
import { CommunityStatsDto } from './dto/community-stats.dto';

/**
 * Every `:id` here is parsed with ParseUUIDPipe. `reports.id` and
 * `report_comments.id` are real uuid columns, so a malformed id must fail as a
 * 400 at the edge — without it the raw string reaches Postgres and comes back
 * as error 22P02, which Nest surfaces as an unhandled 500. Same rule, same
 * reason, as the admin controllers (see admin-reports.controller.ts); user ids
 * are deliberately NOT parsed anywhere, because Better Auth's `user.id` is text.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(
    @Session() session: UserSession<typeof auth>,
    @Body() body: CreateReportDto,
    // Needed to build the stored photo URL from a declared origin — the same
    // request-derived rule POST /uploads uses, so a phone on the LAN gets a URL
    // it can actually fetch. See uploads/upload-url.ts.
    @Req() req: Request,
  ) {
    return this.reportsService.create(session.user.id, body, req);
  }

  @Get()
  list(
    @Session() session: UserSession<typeof auth>,
    @Query() query: ListReportsDto,
  ) {
    return this.reportsService.list(query, session.user.id);
  }

  // 'categories'/'summary' declared before ':id' — otherwise they'd match as an id.
  @Get('categories')
  listCategories() {
    return this.reportsService.listCategories();
  }

  @Get('summary')
  summary(@Query() query: ReportsSummaryDto) {
    return this.reportsService.summary(query);
  }

  @Get('community-stats')
  communityStats(@Query() query: CommunityStatsDto) {
    return this.reportsService.communityStats(query);
  }

  @Get(':id')
  findOne(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.findOne(id, session.user.id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateReportDto,
    @Req() req: Request,
  ) {
    return this.reportsService.update(id, session.user.id, body, req);
  }

  @Post(':id/photos')
  addPhoto(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddPhotoDto,
    @Req() req: Request,
  ) {
    return this.reportsService.addPhoto(
      id,
      session.user.id,
      body.uploadId,
      req,
    );
  }

  /**
   * The reporter's reply to "please send us a different photo".
   *
   * PUT, not POST: it is a full replace of the report's photo set, and it is
   * idempotent in the sense that matters — sending the same set twice does not
   * accumulate photos. Distinct from `POST :id/photos`, which ADDS one to a live
   * report and is refused on a held one.
   */
  @Put(':id/photos')
  replaceHeldPhotos(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplaceHeldPhotosDto,
    @Req() req: Request,
  ) {
    return this.reportsService.replaceHeldPhotos(
      id,
      session.user.id,
      body.photoUploadIds,
      req,
    );
  }

  @Post(':id/close')
  close(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.close(id, session.user.id);
  }

  @Delete(':id')
  delete(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.delete(id, session.user.id);
  }

  @Post(':id/save')
  save(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.save(id, session.user.id);
  }

  @Delete(':id/save')
  unsave(
    @Session() session: UserSession<typeof auth>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportsService.unsave(id, session.user.id);
  }
}
