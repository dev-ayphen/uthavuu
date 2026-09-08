// The one rate-limiting primitive in this codebase.
//
// WHY IT EXISTS. Before this file there were two hand-rolled limiters —
// auth/otp/otp-rate-limiter.ts and uploads/upload-rate-limiter.ts — that had
// independently converged on the same INCR/EXPIRE/TTL dance, down to the same
// comment about what a -1 TTL means. The second one says so out loud: "SHAPE IS
// LIFTED FROM otp-rate-limiter.ts on purpose ... so there is one rate-limiting
// idiom in this codebase rather than two." This is that idiom, extracted, and
// both of those files now delegate to it with their behaviour unchanged.
//
// WHY REDIS AND NOT AN IN-PROCESS COUNTER. The deployment target is Vercel
// Functions (CLAUDE.md § Stack Summary), where the API runs as many concurrent
// instances with no shared memory. A per-process counter does not limit anything
// — it multiplies every limit by however many instances happen to be warm, and
// it does so silently, so the limiter looks like it is working right up until
// the traffic that would have proved otherwise arrives. Better Auth's own
// `rateLimit` has exactly this property and auth.ts:94-98 already flags it.
// Redis is not new infrastructure here: lib/redis.ts is already imported by both
// existing limiters and by the Nest RedisModule.
//
// WHY A FIXED WINDOW AND NOT A SLIDING ONE. A fixed window lets a caller spend
// two full allowances across a window boundary (the classic 2x burst). A sliding
// window log would cost a sorted set, a ZREMRANGEBYSCORE and O(n) members per
// key instead of one integer. For traffic shaping on an emergency-help API the
// 2x boundary burst is not the threat — sustained abuse is, and a fixed window
// bounds sustained rate exactly. This is the same trade both existing limiters
// already made; making it explicit here means it is a decision rather than an
// accident.

import { redis } from '../lib/redis';

/** How many requests are allowed, and over how long. */
export interface RateLimitWindow {
  readonly max: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Requests counted in this window INCLUDING the one just consumed. */
  readonly used: number;
  /** Seconds until the window rolls over. 0 when `allowed`. */
  readonly retryAfterSeconds: number;
}

/**
 * Counts one request against `key` and says whether it may proceed.
 *
 * ERRORS ARE NOT SWALLOWED HERE, and that is deliberate. Whether an unreachable
 * Redis should fail the request (closed) or wave it through (open) is not a
 * property of the counter — it is a property of what the counter is protecting,
 * and the two callers in this codebase genuinely want opposite answers:
 *
 *   - The OTP and photo-upload limiters guard SPEND (msg91 SMS, Rekognition
 *     calls). An unavailable limiter must never become an unlimited bill, so
 *     they let this throw and the request 500s. That is today's behaviour and
 *     this extraction does not change it.
 *   - The guard and middleware in this directory shape TRAFFIC. They catch and
 *     fail open, because a Redis blip must not take an emergency-help product
 *     offline. See rate-limit.guard.ts for the full argument.
 *
 * Deciding that here, once, for both, would have to be wrong for one of them.
 */
export async function consumeRateLimit(
  key: string,
  { max, windowSeconds }: RateLimitWindow,
): Promise<RateLimitResult> {
  const used = await redis.incr(key);

  // Only the request that created the key sets the expiry. Refreshing it on
  // every hit would turn the fixed window into a rolling ban: a caller who kept
  // knocking would keep pushing their own reset further away and never recover.
  if (used === 1) {
    await redis.expire(key, windowSeconds);
  }

  if (used <= max) {
    return { allowed: true, used, retryAfterSeconds: 0 };
  }

  // -1 (key has no expiry) and -2 (key vanished between INCR and TTL) both mean
  // "unknown". Quoting the whole window can only over-estimate the wait, which
  // is the safe direction: an over-estimate makes a client wait slightly too
  // long, an under-estimate makes it retry into another refusal.
  const ttl = await redis.ttl(key);
  return {
    allowed: false,
    used,
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}
