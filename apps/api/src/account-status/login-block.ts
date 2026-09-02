// ACCOUNT SUSPENSION — enforcement point #1 of ADR 0011, the login half.
//
// docs/decisions/0011-user-suspension-blocks-login-not-content.md names exactly
// two enforcement points. Point #2, the per-request block, lives in
// suspended-account.guard.ts. This file is point #1: the decision that refuses
// to mint a session for a suspended account, so no token and no cookie is ever
// issued.
//
// WHY IT IS HERE AND NOT IN auth/auth.ts, where it is wired.
//
// It was in auth.ts, inline in the `session.create.before` hook, and that made
// it untestable. `auth.ts` imports `better-auth`, `better-auth/api`,
// `better-auth/adapters/drizzle` and `better-auth/plugins` — all ESM-only, and
// this package runs Jest through a CommonJS ts-jest transform, so no spec could
// import the file at all (the same constraint documented at admin-rbac.ts:13-17
// and worked around in admin-module-guard.spec.ts). The rule that decides
// whether a person may sign in was therefore the one part of the suspension
// feature with zero test coverage: the hook could have been deleted outright
// and the whole suite would still have gone green.
//
// So the decision moved down here, where it is a plain async function over the
// database with no library imports, and `auth.ts` keeps only the wiring.
//
// WHY IT RETURNS A DECISION INSTEAD OF THROWING.
//
// The rejection has to reach the client as Better Auth's `APIError`, and
// `APIError` is imported from `better-auth/api` — ESM, the exact thing this
// file exists to stay clear of. Throwing the library type here would drag the
// untestability straight back in. Returning a discriminated result instead
// keeps the status, the code and the message under test as ordinary values,
// and leaves `auth.ts` with a single mechanical `throw APIError.from(...)`
// that has nothing left to get wrong.
import {
  ACCOUNT_SUSPENDED_CODE,
  ACCOUNT_SUSPENDED_MESSAGE,
  isUserSuspended,
} from './account-status';

/**
 * The `status` half is Better Auth's own status name, not an HTTP number, so it
 * can be handed to `APIError.from()` verbatim. FORBIDDEN is 403 — never 401,
 * for the reason spelled out at ACCOUNT_SUSPENDED_CODE.
 *
 * The `error` half is shaped to `APIError.from`'s second parameter
 * (`{ code, message }`, verified against the installed @better-auth/core 1.7.1
 * source rather than recalled) so the call site cannot reshape it on the way
 * through and quietly drop the code the mobile client keys on.
 */
export type SessionCreateDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 'FORBIDDEN';
      error: { code: string; message: string };
    };

/**
 * Decides whether Better Auth may create a session for this user.
 *
 * Called from the `session.create.before` database hook in auth/auth.ts, which
 * is the ONE chokepoint every sign-in path passes through — admin
 * email+password, mobile phone-OTP verify, and any provider added later. That
 * is why the check lives at session creation rather than on the individual
 * sign-in routes: a future route inherits it instead of having to remember it.
 *
 * Gates on the id of the account signing in and nothing else. There is no
 * second lookup in here to get wrong, which is what keeps a volunteer's login
 * working while the reporter they are helping is suspended (ADR 0011's
 * load-bearing scenario).
 */
export async function decideSessionCreate(session: {
  userId: string;
}): Promise<SessionCreateDecision> {
  if (await isUserSuspended(session.userId)) {
    return {
      allowed: false,
      status: 'FORBIDDEN',
      // Byte-identical to what SuspendedAccountGuard returns on an
      // authenticated request, so a client has one case to handle and not two.
      error: {
        code: ACCOUNT_SUSPENDED_CODE,
        message: ACCOUNT_SUSPENDED_MESSAGE,
      },
    };
  }

  return { allowed: true };
}
