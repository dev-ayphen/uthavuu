import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminGuard } from './admin.guard';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';
import { AdminCommentsController } from './admin-comments.controller';
import { AdminCommentsService } from './admin-comments.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminImpactStoriesController } from './admin-impact-stories.controller';
import { AdminImpactStoriesService } from './admin-impact-stories.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSystemHealthService } from './admin-system-health.service';
import { AdminReportModerationService } from './admin-report-moderation.service';
import { AdminCommunityUpdatesController } from './admin-community-updates.controller';
import { AdminCommunityUpdatesService } from './admin-community-updates.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminSponsorsController } from './admin-sponsors.controller';
import { AdminSponsorsService } from './admin-sponsors.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import {
  ADMIN_CREDENTIALS,
  BetterAuthAdminCredentials,
} from './admin-credentials';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';
import { AdminBroadcastsController } from './admin-broadcasts.controller';
import { AdminBroadcastsService } from './admin-broadcasts.service';
import { AlertsModule } from '../alerts/alerts.module';
import { PushModule } from '../push/push.module';

@Module({
  // AlertsModule: an admin close notifies the volunteers already en route,
  // reusing the citizen path's existing `report_cancelled` alert. Alerts are
  // the only notification channel this product has.
  // PushModule: Broadcasts fans out to the citizen's existing `alerts` log AND
  // to FCM, and it calls PushService directly rather than through
  // AlertsService.create(). That is not a duplicate sender — it is the same
  // PushService — but the shape differs: create() writes one row and pushes one
  // notification per call, which is right for the five event-driven alerts and
  // wrong for a fan-out that must batch its inserts and bound its push
  // concurrency across tens of thousands of recipients.
  imports: [AlertsModule, PushModule],
  // Every controller listed here MUST carry a class-level @AdminOnly().
  // admin-module-guard.spec.ts walks this array and asserts it, so adding one
  // without the decorator fails the suite instead of publishing an ungated
  // admin route — which is the failure mode ADR 0009 names as the only way to
  // get one.
  controllers: [
    AdminController,
    AdminActivityController,
    AdminAuditController,
    AdminUsersController,
    AdminCategoriesController,
    AdminSupportController,
    AdminCommentsController,
    AdminReportsController,
    AdminImpactStoriesController,
    AdminAnalyticsController,
    AdminCommunityUpdatesController,
    AdminSettingsController,
    AdminSponsorsController,
    AdminAccountsController,
    AdminBroadcastsController,
  ],
  // AdminGuard is a provider, not an APP_GUARD: it is deliberately opt-in per
  // controller via @AdminOnly(), because it must never run on the citizen API.
  // Registering it globally would put every mobile endpoint behind an admin
  // check.
  providers: [
    AdminService,
    AdminDashboardService,
    AdminActivityService,
    AdminGuard,
    AdminAuditService,
    AdminUsersService,
    AdminCategoriesService,
    AdminSupportService,
    AdminCommentsService,
    AdminReportsService,
    AdminImpactStoriesService,
    AdminAnalyticsService,
    AdminSystemHealthService,
    AdminReportModerationService,
    AdminCommunityUpdatesService,
    AdminSettingsService,
    AdminSponsorsService,
    AdminAccountsService,
    // The ONLY binding of a password implementation in the app. Everything
    // AdminAccountsService does to a credential goes through this token, and
    // the class behind it defers its (ESM-only) better-auth import to first
    // use — so loading this module in a spec stays free. See admin-credentials.ts.
    AdminBroadcastsService,
    { provide: ADMIN_CREDENTIALS, useClass: BetterAuthAdminCredentials },
  ],
  exports: [AdminService],
})
export class AdminModule {}
