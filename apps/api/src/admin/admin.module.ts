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
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSystemHealthService } from './admin-system-health.service';
import { AdminReportModerationService } from './admin-report-moderation.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  // AlertsModule: an admin close notifies the volunteers already en route,
  // reusing the citizen path's existing `report_cancelled` alert. Alerts are
  // the only notification channel this product has.
  imports: [AlertsModule],
  // Every controller listed here MUST carry a class-level @AdminOnly().
  // admin-module-guard.spec.ts walks this array and asserts it, so adding one
  // without the decorator fails the suite instead of publishing an ungated
  // admin route — which is the failure mode ADR 0009 names as the only way to
  // get one.
  controllers: [
    AdminController,
    AdminAuditController,
    AdminUsersController,
    AdminCategoriesController,
    AdminSupportController,
    AdminCommentsController,
    AdminReportsController,
    AdminAnalyticsController,
  ],
  // AdminGuard is a provider, not an APP_GUARD: it is deliberately opt-in per
  // controller via @AdminOnly(), because it must never run on the citizen API.
  // Registering it globally would put every mobile endpoint behind an admin
  // check.
  providers: [
    AdminService,
    AdminDashboardService,
    AdminGuard,
    AdminAuditService,
    AdminUsersService,
    AdminCategoriesService,
    AdminSupportService,
    AdminCommentsService,
    AdminReportsService,
    AdminAnalyticsService,
    AdminSystemHealthService,
    AdminReportModerationService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
