// Caps how many report photos one account may upload in a rolling window.
//
// WHY THIS EXISTS. This control has the same property the OTP limiter does — it
// is the one thing standing between a stranger and an unbounded third-party
// bill. Every report photo triggers two paid Rekognition calls, with the added
// cost that every upload also writes a file to disk that something must later
// clean up. An authenticated citizen could otherwise POST as fast as their
// connection allows, forever: fine when the only consequence is disk, a billing
// incident when the consequence is a metered API.
//
// RELATIONSHIP TO THE API-WIDE LIMITER (../rate-limit/). Both exist, they count
// different things, and neither replaces the other:
//
//   - RateLimitGuard applies the generic `write` policy to this route (30/min).
//     That is a BURST valve — it runs before multer, so a flood is refused
//     before a 5MB body is even read off the socket.
//   - This limiter is the SPEND ceiling (20 per 15 minutes). It is tighter over
//     any window longer than about 40 seconds, which makes it the binding
//     constraint in practice, and it is the one whose number was chosen from
//     what a photo costs rather than from what a client should burst at.
//
// They are separate budgets in separate Redis namespaces, not one budget counted
// twice.
//
// THE COUNTING NOW LIVES IN ../rate-limit/rate-limit.ts, extracted from the copy
// that used to be inline here and the near-identical copy in
// auth/otp/otp-rate-limiter.ts. Key, window, maximum, error type and
// retry-after semantics are all unchanged.
//
// IT STILL FAILS CLOSED. The general-purpose guard and middleware fail OPEN on a
// Redis outage, because refusing an emergency report is worse than not
// throttling it. This one guards money, so an unavailable limiter must surface
// as a 500 rather than become an unlimited Rekognition invoice.

import { consumeRateLimit } from '../rate-limit/rate-limit';

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

  const result = await consumeRateLimit(key, {
    max: MAX_UPLOADS,
    windowSeconds: WINDOW_SECONDS,
  });

  if (!result.allowed) throw new UploadRateLimitError(result.retryAfterSeconds);
}
