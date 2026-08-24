import type { OtpRateLimitError } from './otp-rate-limiter';

/**
 * The subset of Better Auth's `APIError` that its dispatcher actually reads when
 * turning a thrown error into an HTTP response (`dispatchAuthEndpoint` uses
 * `e.statusCode`, `e.body` and `e.headers` —
 * better-auth/dist/api/dispatch.mjs:230).
 */
export interface OtpApiError extends Error {
  name: 'APIError';
  /**
   * The string status key. Easy to mistake for redundant next to `statusCode`,
   * but better-call's `toResponse` calls `data.status.toString()` unconditionally
   * (better-call/dist/to-response.mjs:127) — omit it and the response throws a
   * TypeError *after* passing `isAPIError`, which the client sees as the very
   * empty 500 this module exists to eliminate. Caught live, not by unit tests.
   */
  status: 'TOO_MANY_REQUESTS';
  statusCode: number;
  body: { code: string; message: string; retryAfterSeconds: number };
  headers: Record<string, string>;
}

/**
 * Turns an {@link OtpRateLimitError} into something Better Auth serialises as a
 * real HTTP 429 with a body.
 *
 * Previously `sendOTP` threw a plain Error, so Better Auth could only treat it as
 * an unhandled fault: the client got `500` with a zero-length body and no way to
 * tell "slow down" from "the server fell over" (verified live 2026-08-24).
 *
 * Why a shaped object instead of `new APIError(...)`: the real class lives in
 * `better-call`, which is a transitive dependency of better-auth and is not
 * resolvable from this package — and importing it directly would pin us to
 * better-auth's internal dependency graph. Better Auth's own recogniser is
 * duck-typed for exactly this reason: `isAPIError` ends with
 * `error?.name === "APIError"` (@better-auth/core/dist/utils/is-api-error.mjs:4),
 * which also sidesteps the two-copies-of-@better-auth/core `instanceof` problem
 * that made the original author avoid APIError in the first place.
 *
 * The contract this leans on is a duck-type across a package boundary, so these
 * unit tests alone cannot prove it: they assert the shape, not that Better Auth
 * still honours it. It is confirmed by hitting the running API and reading the
 * real status line (429 + `Retry-After`) — redo that check on any better-auth
 * upgrade.
 */
export function otpRateLimitApiError(error: OtpRateLimitError): OtpApiError {
  const apiError = new Error(error.message) as OtpApiError;
  apiError.name = 'APIError';
  apiError.status = 'TOO_MANY_REQUESTS';
  apiError.statusCode = 429;
  apiError.body = {
    // Machine-readable so the client branches on a code, not on prose; sits
    // alongside Better Auth's own PHONE_NUMBER_ERROR_CODES values.
    code: 'OTP_RATE_LIMITED',
    message: error.message,
    retryAfterSeconds: error.retryAfterSeconds,
  };
  apiError.headers = { 'Retry-After': String(error.retryAfterSeconds) };
  return apiError;
}
