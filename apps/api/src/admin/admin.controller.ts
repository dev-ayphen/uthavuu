import { Controller, Get, Query } from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { AdminService } from './admin.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardDto } from './dto/admin-dashboard.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Everything the admin console can reach. One controller, one @AdminOnly() on
 * the class — so a route added here is gated by construction, and the only way
 * to publish an ungated admin route is to create a whole new controller and
 * forget the decorator on it.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 */
@Controller('admin')
@AdminOnly()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly dashboardService: AdminDashboardService,
  ) {}

  /**
   * GET /admin/me — who the console is signed in as, and what they may do.
   *
   * The console renders its sidebar and role badge from this, which is the
   * whole point: the role arrives from the server having been resolved from a
   * verified session, so there is no `?role=` for a visitor to type. Reaching
   * this route at all already proves admin status; `permissions` then tells the
   * console which sections to show. That is a UI convenience, not the
   * enforcement — every privileged route re-checks server-side.
   */
  @Get('me')
  me(@CurrentAdmin() admin: AdminIdentity) {
    return admin;
  }

  /** GET /admin/dashboard — the Dashboard tab's headline counters. Both roles. */
  @Get('dashboard')
  dashboard(@Query() query: AdminDashboardDto) {
    return this.dashboardService.counters(query);
  }

  /**
   * GET /admin/admins — the console's own admin directory.
   *
   * Super admins only. docs/webadmin/09-admins-and-audit.md gap #2: in the
   * prototype "an Ops Moderator — or an unauthenticated visitor — can create a
   * Super Admin", because that tab had no role guard at all. This is that guard,
   * on the server, where it cannot be bypassed by editing the URL.
   */
  @Get('admins')
  @RequireAdminPermissions('platform:manage')
  listAdmins() {
    return this.adminService.listAdmins();
  }
}
