// Enforces docs/features/auth.md BR-2: max 3 OTP requests per phone number per
// rolling 10-minute window. Better Auth's `allowedAttempts` config covers verify
// attempts (5, set in ../auth.ts) but has no per-phone send-rate limit of its own —
// this fills that gap, called from inside the `sendOTP` callback before any SMS
// provider is touched, so a rate-limited request never reaches (and never costs) msg91.

import { redis } from '../../lib/redis';
import { normalizePhoneNumber } from './phone-number';

const WINDOW_SECONDS = 10 * 60;
const MAX_REQUESTS = 3;

export class OtpRateLimitError extends Error {
  /** Seconds until the window rolls over — drives the client's resend countdown. */
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number = WINDOW_SECONDS) {
    super('Too many OTP requests. Try again later.');
    this.name = 'OtpRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function checkOtpSendRateLimit(
  phoneNumber: string,
): Promise<void> {
  // Key on the canonical form, never the raw client string. Callers already
  // normalise upstream (auth.ts's before-hook), but this control is the one
  // standing between a stranger and an unbounded msg91 bill, so it does not
  // trust its caller. An un-normalisable value still gets a bucket — refusing
  // to count it would make garbage input the cheapest bypass of all.
  const key = `otp:send:${normalizePhoneNumber(phoneNumber) ?? phoneNumber}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  if (count > MAX_REQUESTS) {
    // -1 (no expiry) and -2 (key gone between INCR and TTL) both mean "unknown";
    // quoting the full window is the safe answer — it can only over-estimate the wait.
    const ttl = await redis.ttl(key);
    throw new OtpRateLimitError(ttl > 0 ? ttl : WINDOW_SECONDS);
  }
}
