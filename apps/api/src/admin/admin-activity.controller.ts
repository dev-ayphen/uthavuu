import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly, CurrentAdmin } from './admin.decorators';
import { AdminActivityService } from './admin-activity.service';
import { ListActivityDto } from './dto/list-activity.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Dashboard -> Recent Activity.
 *
 * Its own controller rather than another route on AdminController, for the
 * reason ADR 0009 gives for the split generally: this is a distinct projection
 * over six tables with its own pagination contract, and one class-level
 * @AdminOnly() is the smallest unit of gating that cannot be forgotten
 * per-route.
 *
 * No @RequireAdminPermissions: both roles land on the Dashboard, so both see
 * the feed — the same default the dashboard counters use. The one part of it
 * that IS permission-scoped, the `admin.action` rows, is scoped inside the
 * service against the caller's own permissions and declared back to the console
 * as `includesAdminActions`. Gating the whole route on `platform:manage` would
 * have left ops admins with an empty panel and no explanation.
 */
@Controller('admin/activity')
@AdminOnly()
export class AdminActivityController {
  constructor(private readonly activityService: AdminActivityService) {}

  /** GET /admin/activity?limit=20&cursor=… — newest first. */
  @Get()
  list(@Query() query: ListActivityDto, @CurrentAdmin() admin: AdminIdentity) {
    return this.activityService.list(query, admin);
  }
}
