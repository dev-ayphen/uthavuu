// Enforces docs/features/auth.md BR-2: max 3 OTP requests per phone number per
// rolling 10-minute window. Better Auth's `allowedAttempts` config covers verify
// attempts (5, set in ../auth.ts) but has no per-phone send-rate limit of its own —
// this fills that gap, called from inside the `sendOTP` callback before any SMS
// provider is touched, so a rate-limited request never reaches (and never costs) msg91.
//
// THE COUNTING NOW LIVES IN ../../rate-limit/rate-limit.ts. This file kept its own
// copy of the INCR/EXPIRE/TTL dance until the API-wide limiter was built, at which
// point there would have been three copies of it. The window, the maximum, the key,
// the error type and the retry-after semantics here are all unchanged — only the
// four lines that talk to Redis moved.
//
// IT STILL FAILS CLOSED, and that is the one thing that must not drift. The
// general-purpose guard and middleware in rate-limit/ deliberately fail OPEN on a
// Redis outage, because refusing an emergency report is worse than not throttling
// it. This limiter guards a THIRD-PARTY BILL rather than throughput: if Redis is
// unreachable the right answer is a 500, not an unbounded run of real SMS. That is
// why consumeRateLimit() lets its errors escape instead of deciding centrally — the
// two callers genuinely need opposite behaviour.

import { consumeRateLimit } from '../../rate-limit/rate-limit';
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

  const result = await consumeRateLimit(key, {
    max: MAX_REQUESTS,
    windowSeconds: WINDOW_SECONDS,
  });

  // consumeRateLimit already resolves the retry-after from the key's TTL, and
  // already quotes the full window when that TTL is unknown (-1 or -2) — the
  // same over-estimate-rather-than-under-estimate rule this file used to apply
  // inline.
  if (!result.allowed) throw new OtpRateLimitError(result.retryAfterSeconds);
}
