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
 * Platform -> Categories.
 *
 * WRITING a category changes live mobile behaviour for every citizen — the label
 * they read, how long their next request stays alive, whether the category
 * exists at all — which is a platform decision rather than a moderation one.
 * Hence `platform:manage` (super admin only) at the CLASS level, where it
 * applies to every route by default.
 *
 * ================= READING IS A SEPARATE, WIDER PERMISSION ================
 * `GET` overrides that default with `reports:manage`, which BOTH roles hold, and
 * the reason is a concrete bug rather than a philosophical one about read/write
 * splits.
 *
 * The reports queue's Category filter is the only in-product consumer of this
 * list besides the Categories page itself. `GET /admin/reports` needs
 * `reports:manage`; enumerating categories needed `platform:manage`. So an ops
 * admin — the role that lives in the reports queue — could work the queue but
 * not fetch the list of categories to filter it by, and the console dealt with
 * that by silently dropping the filter control for them
 * (apps/admin/src/features/reports/use-report-categories.ts). The moderators who
 * use the queue most were exactly the people who could not filter it.
 *
 * Reading the taxonomy discloses nothing sensitive: it is nine rows of labels
 * and emoji that every signed-in CITIZEN can already fetch from
 * `GET /reports/categories`. The admin variant differs only by also returning
 * non-citizen-selectable rows and a report count. Widening the read gate to the
 * roles that already see far more (every report, every user) gives away nothing
 * and fixes a real hole in the console.
 *
 * ============== WHY THE OVERRIDE IS ON GET, NOT THE OTHER WAY ==============
 * AdminGuard resolves permissions with `reflector.getAllAndOverride([handler,
 * class])`, so a method-level decorator REPLACES the class-level one rather than
 * adding to it. That makes the direction of this arrangement load-bearing: the
 * class carries the STRICTEST gate, and exactly one method opts down to a wider
 * one. A route added to this controller tomorrow with no decorator inherits
 * `platform:manage` — the safe default — instead of inheriting nothing. Listing
 * every route explicitly would read more plainly but would fail open the first
 * time someone forgot a line, which is the trade this file is deliberately not
 * making. `admin-categories-permissions.spec.ts` asserts the resolved gate of
 * each of the four routes so a future refactor cannot quietly widen a write.
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
  @RequireAdminPermissions('reports:manage')
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
