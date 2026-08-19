import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { AddPhotoDto } from './dto/add-photo.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { ReportsSummaryDto } from './dto/reports-summary.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(@Session() session: UserSession<typeof auth>, @Body() body: CreateReportDto) {
    return this.reportsService.create(session.user.id, body);
  }

  @Get()
  list(@Session() session: UserSession<typeof auth>, @Query() query: ListReportsDto) {
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

  @Get(':id')
  findOne(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.reportsService.findOne(id, session.user.id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
    @Body() body: UpdateReportDto
  ) {
    return this.reportsService.update(id, session.user.id, body);
  }

  @Post(':id/photos')
  addPhoto(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
    @Body() body: AddPhotoDto
  ) {
    return this.reportsService.addPhoto(id, session.user.id, body.url);
  }

  @Post(':id/close')
  close(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.reportsService.close(id, session.user.id);
  }
}
