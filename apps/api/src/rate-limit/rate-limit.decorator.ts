import { SetMetadata } from '@nestjs/common';
import type { RateLimitPolicy } from './rate-limit-config';

export const RATE_LIMIT_POLICY_METADATA = 'RATE_LIMIT_POLICY';
export const RATE_LIMIT_EXEMPT_METADATA = 'RATE_LIMIT_EXEMPT';

/**
 * Assigns a route a stricter policy than its method would get by default.
 *
 * The decorator names a policy, never a number — see rate-limit-config.ts for
 * why the numbers live in one env-overridable table instead of at call sites.
 *
 * Routes with no decorator are NOT unlimited: RateLimitGuard classifies them by
 * HTTP method and admin-ness (rate-limit-policy.ts). Decorate a route only when
 * the default is genuinely wrong for it.
 */
export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_POLICY_METADATA, policy);

/**
 * Exempts a route from rate limiting entirely.
 *
 * There is exactly one legitimate use and it is the health endpoint. A liveness
 * or readiness probe that gets a 429 is reported as an unhealthy instance, so a
 * limiter on the health check can take a deployment down by itself — the
 * limiter succeeding at its job and the platform killing the container are the
 * same event. Nothing else should carry this: an endpoint too hot to limit is an
 * endpoint that needs a more generous policy, not an absent one.
 */
export const NoRateLimit = () => SetMetadata(RATE_LIMIT_EXEMPT_METADATA, true);
