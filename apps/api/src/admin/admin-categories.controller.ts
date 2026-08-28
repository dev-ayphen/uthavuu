import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import type { AdminRequestMeta } from './admin-request-meta';
import { AdminCategoriesService } from './admin-categories.service';
import { CreateReportCategoryDto } from './dto/create-report-category.dto';
import { UpdateReportCategoryDto } from './dto/update-report-category.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Platform -> Categories. Gated on `platform:manage`, so Ops Admins get a 403
 * with ADMIN_MISSING_PERMISSION: editing a category changes live mobile
 * behaviour for every citizen, which is a platform decision rather than a
 * moderation one.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 * The class-level @AdminOnly() is what makes every route here gated by
 * construction.
 */
@Controller('admin/report-categories')
@AdminOnly()
@RequireAdminPermissions('platform:manage')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: AdminCategoriesService) {}

  @Get()
  list() {
    return this.categoriesService.list();
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: CreateReportCategoryDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.categoriesService.create(admin, body, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdateReportCategoryDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.categoriesService.update(id, admin, body, meta);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.categoriesService.delete(id, admin, meta);
  }
}
