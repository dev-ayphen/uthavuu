import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitExceptionFilter } from './rate-limit.filter';

/**
 * Registers RateLimitGuard globally, plus the filter that puts `Retry-After` on
 * its refusals.
 *
 * A MODULE AND NOT A LINE IN AppModule's `providers`, for the reason
 * account-status.module.ts documents from experience: Nest instantiates a
 * module's OWN providers before those of the modules it imports, so a global
 * guard declared directly on AppModule runs AHEAD of the AuthGuard that
 * AuthModule.forRoot() registers. This guard keys on the session user id. Ahead
 * of the auth guard there is no session, so it would silently key every request
 * on its IP instead — a limiter that still returns 200s and 429s and looks
 * entirely healthy while enforcing the wrong thing on every authenticated
 * request in the product. That is the failure mode this placement prevents, and
 * it is not one a test would catch by accident.
 *
 * Imported in AppModule BEFORE MaintenanceModule and AccountStatusModule, making
 * the final guard order:
 *
 *   AuthGuard -> RateLimitGuard -> MaintenanceGuard -> SuspendedAccountGuard
 *
 * Rate limiting deliberately comes FIRST of the three application guards. It is
 * the only one whose job is to stop work from happening, so it should run before
 * the guards that do work: MaintenanceGuard reads platform settings and
 * SuspendedAccountGuard queries the user's status, and neither of those lookups
 * should be spendable by a caller who is already over their limit. The
 * observable consequence is which code a rate-limited suspended user sees during
 * maintenance — RATE_LIMITED — and that is the right answer, because it is the
 * one that tells them to stop sending requests.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: RateLimitExceptionFilter },
  ],
})
export class RateLimitModule {}
