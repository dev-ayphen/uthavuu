import { Injectable, Logger } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { clientIpFor } from './client-ip';
import { consumeRateLimit } from './rate-limit';
import type { RateLimitResult } from './rate-limit';
import { rateLimitConfig } from './rate-limit-config';
import type { RateLimitConfig, RateLimitPolicy } from './rate-limit-config';
import {
  RATE_LIMIT_EXEMPT_METADATA,
  RATE_LIMIT_POLICY_METADATA,
} from './rate-limit.decorator';
import { identityFor, policyFor, rateLimitKey } from './rate-limit-policy';
import { RateLimitedException } from './rate-limited.exception';

/**
 * The per-user rate limiter, applied to every Nest route.
 *
 * GLOBAL, not per-route, for the reason MaintenanceGuard and
 * SuspendedAccountGuard are both global: a control that has to be remembered on
 * each new controller is a control that will be missing from the endpoint
 * somebody adds next month. Routes opt into a STRICTER policy with
 * @RateLimit(); they cannot opt into no policy except with @NoRateLimit(), which
 * exists for the health check and nothing else.
 *
 * ── WHERE IT RUNS, AND WHY THAT IS THE WHOLE DESIGN ─────────────────────────
 * After the Better Auth guard, so `request.session` is resolved and the key can
 * be the session's user id. That ordering is not incidental and it is not free:
 * a global guard registered in AppModule's own `providers` runs BEFORE anything
 * an imported module registers, which is the trap account-status.module.ts
 * documents at length. RateLimitModule is imported, and imported in the right
 * place — see its comment for the exact ordering.
 *
 * The consequence of running after authentication is that anonymous traffic to a
 * CITIZEN route never reaches this guard at all: those routes carry no @Public()
 * and no @OptionalAuth(), so the Better Auth guard 401s first. That traffic is
 * not unlimited — it is caught by RateLimitMiddleware, which runs before every
 * guard precisely because this one cannot. The two are halves of one control,
 * not alternatives.
 *
 * /admin/* is the documented exception: @AdminOnly() bundles OptionalAuth(), so
 * an anonymous admin request DOES arrive here with a null session and is keyed
 * on its IP. See identityFor() in rate-limit-policy.ts for why that is the right
 * answer rather than a gap.
 *
 * ── FAIL OPEN, DELIBERATELY ─────────────────────────────────────────────────
 * If Redis is unreachable this guard LETS THE REQUEST THROUGH and logs.
 *
 * Uthavu is how someone asks for help in an emergency. Failing closed would mean
 * that a Redis blip — an eviction, a failover, a network partition lasting
 * seconds — returns 429 on POST /reports, and the product's entire reason for
 * existing stops working for the duration. Worse, it is self-amplifying: the
 * clients retry, and every retry is another request that cannot be counted and
 * so is also refused. A rate limiter that converts a dependency wobble into a
 * total outage has caused more harm than the abuse it was protecting against.
 *
 * What failing open costs is bounded and recoverable: unthrottled traffic for as
 * long as Redis is down, against an API where every route still requires a valid
 * session and every admin route still requires a permission. Rate limiting is
 * the only thing that degrades; authentication, authorisation, suspension and
 * maintenance mode are all unaffected because none of them touch Redis.
 *
 * THE TWO LIMITERS THAT DO NOT FAIL OPEN are the pre-existing ones, and the
 * difference is what they protect. otp-rate-limiter.ts and upload-rate-limiter.ts
 * stand in front of money — msg91 SMS and Rekognition calls — so for them an
 * unavailable limiter must not become an unlimited bill, and they keep letting
 * the Redis error surface as a 500. Availability is worth more than throttling;
 * it is not worth more than an unbounded third-party invoice. That split is why
 * consumeRateLimit() refuses to decide this centrally.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly config: RateLimitConfig;

  /**
   * Env is read ONCE, at construction. A limit is not meant to change under a
   * running process, and re-reading process.env per request would make the
   * behaviour of a request depend on when it happened to arrive.
   */
  constructor(private readonly reflector: Reflector) {
    this.config = rateLimitConfig();
    if (!this.config.enabled) {
      this.logger.warn(
        'RATE_LIMIT_DISABLED=true — per-user rate limiting is OFF. This must never be set in production.',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.enabled) return true;

    // Only HTTP is served by this app. A future WS gateway would need its own
    // notion of a request and must not silently inherit a pass from here — the
    // same guard rail MaintenanceGuard and SuspendedAccountGuard both set.
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<{
      method?: string;
      session?: { user?: { id?: string } } | null;
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();

    const policy = policyFor({
      method: request.method ?? 'GET',
      isAdminRoute: this.isAdminRoute(context),
      declaredPolicy: this.reflector.getAllAndOverride<
        RateLimitPolicy | undefined
      >(RATE_LIMIT_POLICY_METADATA, [context.getHandler(), context.getClass()]),
      exempt: this.reflector.getAllAndOverride<boolean | undefined>(
        RATE_LIMIT_EXEMPT_METADATA,
        [context.getHandler(), context.getClass()],
      ),
    });
    if (policy === null) return true;

    // `request.session` is set by @thallesp/nestjs-better-auth's own AuthGuard
    // (dist/index.mjs:201) — an object when signed in, null when not.
    //
    // Unlike SuspendedAccountGuard, `undefined` here is NOT treated as a fatal
    // ordering bug. That guard fails loudly on it because reading an unresolved
    // session would silently disable a security control. This one degrades
    // instead: with no user id it keys on the IP, which is a weaker bucket but
    // still a real one. Throwing a 500 across the whole API because the limiter
    // could not find its preferred key would be the failure mode this guard's
    // fail-open policy exists to avoid.
    const identity = identityFor({
      userId: request.session?.user?.id,
      clientIp: clientIpFor(request),
    });

    const definition = this.config.policies[policy];
    const key = rateLimitKey(policy, identity);

    // Declared with its type rather than inferred: a bare `let result;` picks up
    // `any` from the try/catch, which silently disables type checking on the two
    // reads below — including the one that decides whether the request proceeds.
    let result: RateLimitResult;
    try {
      result = await consumeRateLimit(key, definition);
    } catch (error) {
      // Fail open. See the class comment for why this is the right trade for
      // this product and why the two spend-protecting limiters make the
      // opposite one.
      this.logger.error(
        `Rate limit check failed for ${policy}; allowing the request through (fail-open). ${String(error)}`,
      );
      return true;
    }

    if (result.allowed) return true;

    throw new RateLimitedException(
      definition.code,
      definition.message,
      result.retryAfterSeconds,
    );
  }

  /**
   * Whether the handler belongs to an admin controller.
   *
   * Read off the controller's own @Controller() path metadata rather than the
   * request URL, so the classification survives anything that changes the URL
   * without changing what the route is — a setGlobalPrefix() in main.ts most
   * obviously. Lifted verbatim in shape from MaintenanceGuard.isAdminRoute(),
   * and resting on the same guarantee: admin-module-guard.spec.ts walks
   * AdminModule's controller list and asserts every one of them is mounted
   * under `admin`, so this check and that suite fail together if it stops being
   * true.
   */
  private isAdminRoute(context: ExecutionContext): boolean {
    const path = Reflect.getMetadata(PATH_METADATA, context.getClass()) as
      string | string[] | undefined;
    const paths = Array.isArray(path) ? path : [path];
    return paths.some(
      (p) => typeof p === 'string' && (p === 'admin' || p.startsWith('admin/')),
    );
  }
}
