// `./otp-rate-limiter` imports `lib/redis`, which opens a real ioredis
// connection at module load. Nothing here talks to Redis — only the error class
// is needed — so the module is stubbed out; without it the connection stays open
// and Jest never exits ("Jest did not exit one second after the test run").
jest.mock('../../lib/redis', () => ({ redis: {} }));

import { otpRateLimitApiError } from './otp-api-error';
import { OtpRateLimitError } from './otp-rate-limiter';

// Regression for the 2026-08-24 finding: a rate-limited send surfaced as HTTP 500
// with an EMPTY body, so the client could not tell "slow down" from "the server
// crashed" and had nothing to render.
describe('otpRateLimitApiError', () => {
  const error = () => otpRateLimitApiError(new OtpRateLimitError(42));

  it('is a 429, not a 500', () => {
    expect(error().statusCode).toBe(429);
  });

  // This is the whole contract. Better Auth's isAPIError ends with
  // `error?.name === "APIError"`; without that name the dispatcher treats the
  // throw as an unhandled fault and we are back to an empty 500.
  it("is named 'APIError' so Better Auth's duck-typed isAPIError recognises it", () => {
    expect(error().name).toBe('APIError');
  });

  it('is still a real Error, so nothing that catches Error breaks', () => {
    expect(error()).toBeInstanceOf(Error);
    expect(error().stack).toBeDefined();
  });

  // Regression: the first cut of this object set only `statusCode`, and the real
  // response still came back as an empty 500. It passed `isAPIError`, then
  // better-call's toResponse crashed on `data.status.toString()`
  // (better-call/dist/to-response.mjs:127) because the genuine APIError carries
  // BOTH a numeric `statusCode` and a string `status` key. Verified live.
  it("carries the string `status` key better-call's toResponse calls .toString() on", () => {
    expect(error().status).toBe('TOO_MANY_REQUESTS');
    expect(() => error().status.toString()).not.toThrow();
  });

  it('carries a machine-readable code the client can branch on', () => {
    expect(error().body.code).toBe('OTP_RATE_LIMITED');
  });

  it('carries a human-readable message rather than an empty body', () => {
    expect(error().body.message).toEqual(expect.stringContaining('Too many'));
  });

  it('tells the client how long to wait, in the body and the Retry-After header', () => {
    expect(error().body.retryAfterSeconds).toBe(42);
    expect(error().headers['Retry-After']).toBe('42');
  });

  it('propagates the actual remaining window rather than a constant', () => {
    expect(
      otpRateLimitApiError(new OtpRateLimitError(7)).body.retryAfterSeconds,
    ).toBe(7);
    expect(
      otpRateLimitApiError(new OtpRateLimitError(583)).headers['Retry-After'],
    ).toBe('583');
  });
});
