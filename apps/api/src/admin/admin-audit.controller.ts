import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly, RequireAdminPermissions } from './admin.decorators';
import { AdminAuditService } from './admin-audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

/**
 * Platform -> Audit logs.
 *
 * Read-only by construction: there is no write route here and there must never
 * be one. Rows are written only as a side effect of the action being audited,
 * inside that action's own transaction (AdminAuditService.record). An endpoint
 * that let an admin post an audit entry directly would let them forge one.
 */
@Controller('admin/audit-logs')
@AdminOnly()
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  /**
   * GET /admin/audit-logs
   *
   * `platform:manage` — super_admin only. Ops admins generate audit entries;
   * reading the trail of what every admin did is a platform-administration
   * capability, and it is the same gate the Admins directory sits behind.
   */
  @Get()
  @RequireAdminPermissions('platform:manage')
  list(@Query() query: ListAuditLogsDto) {
    return this.auditService.list(query);
  }

  /**
   * GET /admin/audit-logs/catalogue — the action and target-type options for
   * the page's filter dropdowns, served from the lookup tables so an action that
   * has never been performed still appears as a filterable choice.
   *
   * Declared after the bare GET above; Nest matches the literal segment before
   * it would treat it as a parameter, and there is no `:id` route on this
   * controller for it to collide with anyway.
   */
  @Get('catalogue')
  @RequireAdminPermissions('platform:manage')
  catalogue() {
    return this.auditService.catalogue();
  }
}
