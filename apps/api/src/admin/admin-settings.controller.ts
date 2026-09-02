import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  AdminOnly,
  CurrentAdmin,
  RequireAdminPermissions,
} from './admin.decorators';
import { RequestMeta } from './admin-request-meta';
import type { AdminRequestMeta } from './admin-request-meta';
import { AdminSettingsService } from './admin-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import type { AdminIdentity } from './admin-rbac';

/**
 * Platform -> App Settings.
 *
 * Gated on `platform:manage` — the super-admin-only permission (admin-rbac.ts).
 * This screen holds `maintenance_mode` and `read_only_mode`, which stop every
 * citizen write in the product; an Ops Admin can moderate content but must not
 * be able to pause the platform.
 *
 * Thin by design (CLAUDE.md § Conventions): no `db` import, no business logic.
 * The class-level @AdminOnly() is what makes both routes gated by construction
 * — admin-module-guard.spec.ts walks AdminModule's controller list and fails
 * the suite if this decorator is ever dropped.
 *
 * Note the route this controller must always answer: MaintenanceGuard exempts
 * `/admin/*` precisely so `PATCH /admin/settings` still works while maintenance
 * mode is on. Without that, turning the switch on would be irreversible from
 * inside the product.
 */
@Controller('admin/settings')
@AdminOnly()
@RequireAdminPermissions('platform:manage')
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Patch()
  update(
    @CurrentAdmin() admin: AdminIdentity,
    @Body() body: UpdatePlatformSettingsDto,
    @RequestMeta() meta: AdminRequestMeta,
  ) {
    return this.settingsService.update(admin, body, meta);
  }
}
