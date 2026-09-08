// The two decisions a rate limiter actually makes, as plain functions.
//
// They live here rather than inside the guard for the reason login-block.ts
// gives for the same move: a rule expressed as a pure function can be asserted
// directly, exhaustively and without a mocked ExecutionContext. What is left in
// the guard is plumbing.

import type { RateLimitPolicy } from './rate-limit-config';

/** HTTP methods that change state. Everything else is treated as a read. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutating(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export interface RouteClassification {
  readonly method: string;
  /** Whether the handler belongs to a controller mounted under `admin`. */
  readonly isAdminRoute: boolean;
  /** Policy named by @RateLimit(), if any. */
  readonly declaredPolicy?: RateLimitPolicy | undefined;
  /** Whether @NoRateLimit() is present. */
  readonly exempt?: boolean | undefined;
}

/**
 * Which policy governs a route.
 *
 * DEFAULT-ON, NOT DEFAULT-OFF. Every route gets a policy whether or not anyone
 * remembered to decorate it, because — in this codebase's own words about the
 * suspension guard — "a guard you have to remember to apply is a guard that will
 * be missing from the route added next month". A route that is added tomorrow
 * with no decorator is limited by its HTTP method, which is a defensible answer;
 * a route that is added tomorrow and silently unlimited is not.
 *
 * The classification is deliberately coarse. Four buckets — admin/citizen x
 * read/write — cover every route in the API correctly enough, and anything that
 * needs a real number of its own says so with @RateLimit().
 */
export function policyFor(route: RouteClassification): RateLimitPolicy | null {
  if (route.exempt) return null;
  if (route.declaredPolicy) return route.declaredPolicy;

  const mutating = isMutating(route.method);
  if (route.isAdminRoute) return mutating ? 'admin-write' : 'admin-read';
  return mutating ? 'write' : 'read';
}

export interface RequestIdentity {
  /** The identity string used in the Redis key. */
  readonly key: string;
  readonly basis: 'user' | 'ip';
}

/**
 * WHICH BUCKET A REQUEST IS CHARGED TO — the decision that decides whether any
 * of this is worth anything.
 *
 * The rule: a session user id when one exists, the client IP otherwise. Both
 * come from the server. The user id is read off the session
 * @thallesp/nestjs-better-auth already verified and attached to the request; the
 * IP is whatever Express resolved under the `trust proxy` setting (client-ip.ts).
 * Nothing a caller can vary at will — no body field, no header, no query
 * parameter, no device id, no User-Agent — appears anywhere in a key.
 *
 * ── CAN A CALLER HOP BETWEEN BUCKETS TO GET A FRESH ALLOWANCE? ──────────────
 * This is the question that decides whether the limiter is real, and it has two
 * directions. Both are closed, but by different mechanisms.
 *
 * DROPPING THE TOKEN (user bucket -> a fresh IP bucket). Closed everywhere, but
 * by two different mechanisms, and it is worth being precise about which routes
 * are which because they are not all alike:
 *
 *   CITIZEN ROUTES. Not reachable at all. They sit behind the library's global
 *   AuthGuard with no @Public() and no @OptionalAuth(), so an unauthenticated
 *   request is refused with 401 before this guard ever runs. There is no handler
 *   to reach and no cheaper bucket to reach it from.
 *
 *   ADMIN ROUTES. Anonymous requests DO reach this guard, and this is the one
 *   place the `ip` branch below is load-bearing rather than defensive.
 *   @AdminOnly() (admin/admin.decorators.ts) deliberately bundles OptionalAuth()
 *   so that AdminGuard can be the single authority on /admin/* and return one
 *   403 for every rejection instead of leaking route existence through a 401.
 *   The consequence for us is that `request.session` is null on an anonymous
 *   admin request, so it keys on IP — which is the RIGHT answer, because it puts
 *   a bound on admin-route probing that a user-keyed limit could not express.
 *   The hop buys nothing: an anonymous /admin/* request is refused by AdminGuard
 *   with ADMIN_NO_SESSION a moment later, so trading a spent user bucket for a
 *   fresh IP bucket trades it for 403s.
 *
 * An AUTHENTICATED admin still keys on their user id like everyone else, so one
 * busy moderator cannot exhaust a bucket shared with the rest of the staff.
 *
 * CYCLING ACCOUNTS (IP bucket -> a fresh user bucket). This one IS available in
 * principle — a new account is a new bucket — and it is closed at a different
 * layer, on purpose. The per-IP middleware runs BEFORE authentication and
 * charges every request regardless of session, so no amount of signing in and
 * out escapes it; and each new account costs a phone number that survives the
 * per-phone OTP limiter (3 sends per number per 10 minutes). Minting identities
 * is the expensive step, which is where the control belongs.
 *
 * The net effect is that every request is charged twice, to two independent
 * buckets — its IP (middleware, pre-auth) and its user (guard, post-auth) — and
 * the tighter of the two binds. Neither can be swapped for the other.
 */
export function identityFor(input: {
  userId?: string | null | undefined;
  clientIp: string;
}): RequestIdentity {
  if (input.userId) return { key: `u:${input.userId}`, basis: 'user' };
  return { key: `ip:${input.clientIp}`, basis: 'ip' };
}

/**
 * The Redis key. Namespaced per policy so a user's read budget and write budget
 * are separate counters — and separate from the two pre-existing limiters,
 * which keep their own `otp:send:*` and `upload:report-photo:*` namespaces.
 */
export function rateLimitKey(
  policy: RateLimitPolicy,
  identity: RequestIdentity,
): string {
  return `ratelimit:${policy}:${identity.key}`;
}
