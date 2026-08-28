import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SuspendedAccountGuard } from './suspended-account.guard';

/**
 * Registers SuspendedAccountGuard as a global guard.
 *
 * WHY THIS IS A MODULE AND NOT A LINE IN AppModule's `providers`.
 *
 * It was a line in AppModule's `providers` first, and it did not work. Nest
 * instantiates a module's OWN providers before those of the modules it imports,
 * so the guard ran ahead of the library's AuthGuard (registered by
 * `AuthModule.forRoot()`), reached a request whose session had not been resolved
 * yet, and — because it fails closed on `request.session === undefined` rather
 * than assuming anonymous — returned a loud 500 on the very first curl instead
 * of silently letting suspended accounts through. That assertion is the only
 * reason this was a two-minute fix rather than a security hole nobody noticed.
 *
 * Moving the registration into an imported module puts it after AuthModule's
 * APP_GUARD in enhancer order. This module is imported LAST in AppModule so the
 * ordering is visible at the call site and does not depend on where in the list
 * a future import happens to be inserted.
 *
 * The guard keeps its `undefined` check. It is cheap, and it is what turns any
 * future reordering back into an immediate failure rather than a quiet one.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: SuspendedAccountGuard }],
})
export class AccountStatusModule {}
