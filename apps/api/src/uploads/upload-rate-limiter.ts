// Caps how many report photos one account may upload in a rolling window.
//
// WHY THIS EXISTS. Until now the only rate limit in this API was on OTP sends
// (auth/otp/otp-rate-limiter.ts), and its rationale was explicit: that control
// is "the one standing between a stranger and an unbounded msg91 bill". Report
// photo uploads acquire exactly the same property the moment each one triggers
// two paid Rekognition calls, with the added cost that every upload also writes
// a file to disk that something must later clean up.
//
// An authenticated citizen can currently POST to /uploads as fast as their
// connection allows, forever. That is fine when the only consequence is disk;
// it is a billing incident when the consequence is a third-party API.
//
// SHAPE IS LIFTED FROM otp-rate-limiter.ts on purpose — same INCR/EXPIRE/TTL
// dance, same "quote the full window when the TTL is unknown" behaviour — so
// there is one rate-limiting idiom in this codebase rather than two.

import { redis } from '../lib/redis';

/**
 * A citizen reporting a genuine emergency needs at most four photos (the DTO's
 * hard ceiling), plus retries for the ones verification refuses. Twenty per
 * fifteen minutes leaves room for a bad-light retake loop on every photo of a
 * maximum-size report and still bounds the spend.
 */
const WINDOW_SECONDS = 15 * 60;
const MAX_UPLOADS = 20;

export class UploadRateLimitError extends Error {
  /** Seconds until the window rolls over — surfaced to the client as a wait. */
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number = WINDOW_SECONDS) {
    super('Too many photo uploads. Try again shortly.');
    this.name = 'UploadRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Counts one upload against `userId`, throwing once the window is exhausted.
 *
 * Keyed on the session's user id, never on anything the request body carries.
 * The id comes from the Better Auth session the global guard already resolved,
 * so there is no client-supplied value in the key at all — which is the
 * difference between a rate limit and a suggestion.
 *
 * Called BEFORE the file is written and before any provider is touched, for the
 * same reason the OTP limiter runs before msg91: a refused request must not cost
 * anything.
 */
export async function checkUploadRateLimit(userId: string): Promise<void> {
  const key = `upload:report-photo:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  if (count > MAX_UPLOADS) {
    // -1 (key has no expiry) and -2 (key vanished between INCR and TTL) both
    // mean "unknown"; quoting the whole window can only over-estimate the wait.
    const ttl = await redis.ttl(key);
    throw new UploadRateLimitError(ttl > 0 ? ttl : WINDOW_SECONDS);
  }
}
