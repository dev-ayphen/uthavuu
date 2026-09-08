// The per-IP layer, and the only rate limiting that can reach two things a Nest
// guard structurally cannot.
//
// ── WHY THIS IS EXPRESS MIDDLEWARE AND NOT A GUARD ──────────────────────────
// 1. THE AUTH ROUTES ARE NOT NEST ROUTES. @thallesp/nestjs-better-auth mounts
//    Better Auth by calling `httpAdapter.use(...)` with `toNodeHandler(auth)`
//    (dist/index.mjs:879-903) — raw Express middleware. No Nest controller,
//    no handler metadata, no guard ever runs for POST /api/auth/sign-in/email
//    or /api/auth/phone-number/verify. A guard cannot limit login because a
//    guard never sees login.
//
// 2. UNAUTHENTICATED FLOODS NEVER REACH A GUARD EITHER. Every Nest route in this
//    API is behind the library's global AuthGuard, and that guard 401s an
//    anonymous request before any later guard runs. But the 401 is not free: it
//    costs an `auth.api.getSession()` call, which for a forged Bearer token is a
//    database round trip. Without this middleware, an attacker can spend the
//    API's Postgres connection pool on POST /reports without ever holding a
//    session, and RateLimitGuard would never be invoked to notice.
//
// Middleware runs before all of it, which is exactly where a control keyed on
// the only identity available before authentication belongs.
//
// ── WHY THE LIMITS HERE ARE LOOSE ───────────────────────────────────────────
// This layer keys on IP because it has nothing else, and an IP is a poor
// identity on Indian mobile networks where CGNAT puts thousands of unrelated
// subscribers behind one address. rate-limit-config.ts sizes these deliberately
// generously for that reason. Precision lives in the per-user guard; this layer
// only has to bound the two attacks above and stop one machine from cycling
// identities indefinitely.

import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { clientIpFor } from './client-ip';
import { consumeRateLimit } from './rate-limit';
import { rateLimitConfig } from './rate-limit-config';
import type { RateLimitConfig, RateLimitPolicy } from './rate-limit-config';
import { identityFor, rateLimitKey } from './rate-limit-policy';

/**
 * Paths that are never counted.
 *
 * `/` is the health endpoint (AppController). A liveness or readiness probe that
 * receives a 429 is reported as an unhealthy instance, so a limiter on the
 * health check can roll back a good deployment or restart a healthy container
 * all by itself. Exact match only — `/` must not exempt `/reports`.
 */
const EXEMPT_PATHS = new Set(['/', '/health', '/healthz']);

/** Where Better Auth is mounted. Matches auth.ts's documented basePath. */
const AUTH_BASE_PATH = '/api/auth';

export function isExemptPath(path: string): boolean {
  return EXEMPT_PATHS.has(path);
}

/**
 * Which per-IP policy a raw request falls under, before Nest has classified
 * anything. `null` means "do not count this request at all".
 */
export function ipPolicyFor(path: string): RateLimitPolicy | null {
  if (isExemptPath(path)) return null;
  if (path === AUTH_BASE_PATH || path.startsWith(`${AUTH_BASE_PATH}/`)) {
    return 'auth';
  }
  return 'ip-global';
}

export type RateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

/**
 * Builds the middleware. A factory rather than a class so main.ts can install it
 * with `app.use()` BEFORE `useStaticAssets()` and before AuthModule's own
 * `httpAdapter.use()` runs at init — Express dispatches in registration order,
 * and being first is the entire value of this file.
 *
 * FAILS OPEN on a Redis error, for the same reason RateLimitGuard does; the long
 * form of the argument is in that file. Here the stakes are if anything higher,
 * because this layer sits in front of login: failing closed would mean a Redis
 * blip locks every user out of authenticating at all.
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig = rateLimitConfig(),
  logger: Logger = new Logger('RateLimitMiddleware'),
): RateLimitMiddleware {
  if (!config.enabled) {
    logger.warn(
      'RATE_LIMIT_DISABLED=true — per-IP rate limiting is OFF. This must never be set in production.',
    );
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const policy = ipPolicyFor(req.path);
    if (policy === null) {
      next();
      return;
    }

    const definition = config.policies[policy];
    // Always the IP, never the session — there is no session yet, which is the
    // point of running here. `clientIpFor` reads `req.ip` as Express resolved it
    // under `trust proxy`; client-ip.ts explains why reading X-Forwarded-For
    // directly would hand the key to the attacker.
    const identity = identityFor({ clientIp: clientIpFor(req) });
    const key = rateLimitKey(policy, identity);

    consumeRateLimit(key, definition)
      .then((result) => {
        if (result.allowed) {
          next();
          return;
        }

        // Raw Express: this runs outside Nest's router, so no exception filter
        // will see a throw from here. The 429 is written by hand, in the same
        // shape RateLimitExceptionFilter produces, so a client has one contract
        // to handle rather than two.
        res
          .status(429)
          .setHeader('Retry-After', String(result.retryAfterSeconds))
          .json({
            code: definition.code,
            message: definition.message,
            retryAfterSeconds: result.retryAfterSeconds,
          });
      })
      .catch((error: unknown) => {
        logger.error(
          `Rate limit check failed for ${policy}; allowing the request through (fail-open). ${String(error)}`,
        );
        next();
      });
  };
}
