import {
  CanActivate,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
  isUserSuspended,
} from './account-status';

/**
 * Blocks every authenticated request from a suspended account.
 *
 * Registered as a second global guard, after the library's AuthGuard. Global
 * rather than per-route on purpose: the product rule is "cannot perform
 * authenticated actions", and a guard you have to remember to apply is a guard
 * that will be missing from the route added next month. There is no opt-out
 * decorator, because no route should have one.
 *
 * SCOPE — reads as well as writes. The owner's rule enumerates writes ("create
 * reports, accept missions, send mission chat"), but "cannot log in" means a
 * suspended person has no working session at all, so gating reads too is the
 * consistent reading rather than a wider one. It is also the kinder behaviour:
 * a suspended user who can still read gets an app that looks normal until every
 * button fails. Failing the first call with ACCOUNT_SUSPENDED lets the client
 * say what is actually going on.
 *
 * WHAT THIS GUARD DOES NOT DO, and must never start doing: it does not look at
 * the status of anyone except the caller. A volunteer helping a suspended
 * reporter is not suspended, so their requests pass here untouched, and their
 * mission keeps working end to end. That is the owner's load-bearing scenario,
 * and it holds by construction — there is no reporter lookup in this file to
 * get wrong.
 */
@Injectable()
export class SuspendedAccountGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only HTTP is served by this app. Anything else (a future WS gateway)
    // would need its own resolution of the session and must not silently
    // inherit a pass from here.
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<{
      session?: { user?: { id?: string } } | null;
    }>();

    // The library's AuthGuard sets `request.session = session` — an object when
    // signed in, `null` when not. It is `undefined` only if that guard has not
    // run yet, which would mean the two global guards are registered in the
    // wrong order and this one is reading a request nobody has authenticated.
    //
    // Failing loudly on `undefined` is the whole point. The alternative — treat
    // it as anonymous and pass — would turn a guard-ordering regression into a
    // silently disabled suspension check that no test would notice. A 500 on
    // every request is impossible to ship by accident.
    if (request.session === undefined) {
      throw new InternalServerErrorException({
        code: 'AUTH_GUARD_ORDER',
        message:
          'SuspendedAccountGuard ran before the session was resolved. Check global guard registration order in app.module.ts.',
      });
    }

    const userId = request.session?.user?.id;
    // Anonymous. Public routes proceed; protected ones are the library
    // AuthGuard's 401 to raise, not this guard's.
    if (!userId) return true;

    if (await isUserSuspended(userId)) {
      // 403 + a specific code, never 401 — see ACCOUNT_SUSPENDED_CODE for why
      // the distinction is load-bearing for the mobile client.
      throw new ForbiddenException({
        code: ACCOUNT_SUSPENDED_CODE,
        message: ACCOUNT_SUSPENDED_MESSAGE,
      });
    }

    return true;
  }
}
