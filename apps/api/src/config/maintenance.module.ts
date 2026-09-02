import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MaintenanceGuard } from './maintenance.guard';

/**
 * Registers MaintenanceGuard as a global guard.
 *
 * A module and not a line in AppModule's own `providers`, for the reason
 * account-status.module.ts documents at length: Nest instantiates a module's
 * OWN providers before those of the modules it imports, so a guard registered
 * directly on AppModule runs ahead of everything AuthModule sets up. This guard
 * does not read the session, so it would survive that — but registering it the
 * same way as its sibling keeps one pattern for "global guard" in this codebase
 * instead of two that look interchangeable and are not.
 *
 * Imported immediately before AccountStatusModule in AppModule, which puts the
 * guard order at: library AuthGuard -> MaintenanceGuard -> SuspendedAccountGuard.
 * The only observable consequence of that order is which code a suspended user
 * gets while the platform is paused (MAINTENANCE_MODE, not ACCOUNT_SUSPENDED),
 * and the platform-wide fact is the more useful one to report first.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: MaintenanceGuard }],
})
export class MaintenanceModule {}
