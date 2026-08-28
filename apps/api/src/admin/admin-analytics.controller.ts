import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly, RequireAdminPermissions } from './admin.decorators';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSystemHealthService } from './admin-system-health.service';
import { AnalyticsDto } from './dto/analytics.dto';

/**
 * Analytics and System health.
 *
 * Two different gates on one controller, deliberately:
 *   /analytics     -> analytics:view    (super_admin only — ops admins 403)
 *   /system-health -> platform:manage   (super_admin only)
 *
 * These are the routes that actually differentiate the two roles. Everything
 * else in this console is held by both.
 */
@Controller('admin')
@AdminOnly()
export class AdminAnalyticsController {
  constructor(
    private readonly analyticsService: AdminAnalyticsService,
    private readonly systemHealthService: AdminSystemHealthService,
  ) {}

  @Get('analytics')
  @RequireAdminPermissions('analytics:view')
  analytics(@Query() query: AnalyticsDto) {
    return this.analyticsService.overview(query);
  }

  @Get('system-health')
  @RequireAdminPermissions('platform:manage')
  systemHealth() {
    return this.systemHealthService.check();
  }
}
