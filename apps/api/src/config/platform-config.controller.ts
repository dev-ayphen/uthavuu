import { Controller, Get } from '@nestjs/common';
import { PlatformConfigService } from './platform-config.service';

/**
 * `GET /config` — what the mobile app reads at launch to configure itself.
 *
 * Authenticated: the global AuthGuard from @thallesp/nestjs-better-auth covers
 * it with no decorator needed, and there is deliberately no @AllowAnonymous()
 * here. Nothing in this payload is secret, but publishing the platform's
 * operational state — including whether its kill switches are on — to the open
 * internet is an invitation nobody needs, and mobile has a session before it
 * shows any of the screens these values configure.
 *
 * No role branch, per ADR 0009: the admin surface is AdminSettingsController
 * under `/admin`, and an admin calling this route gets exactly what a citizen
 * gets.
 */
@Controller('config')
export class PlatformConfigController {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  @Get()
  get() {
    return this.platformConfigService.get();
  }
}
