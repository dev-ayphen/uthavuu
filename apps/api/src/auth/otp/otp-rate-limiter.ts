// Enforces docs/features/auth.md BR-2: max 3 OTP requests per phone number per
// rolling 10-minute window. Better Auth's `allowedAttempts` config covers verify
// attempts (5, set in ../auth.ts) but has no per-phone send-rate limit of its own —
// this fills that gap, called from inside the `sendOTP` callback before any SMS
// provider is touched, so a rate-limited request never reaches (and never costs) msg91.

import { redis } from '../../lib/redis';

const WINDOW_SECONDS = 10 * 60;
const MAX_REQUESTS = 3;

export class OtpRateLimitError extends Error {
  constructor() {
    super('Too many OTP requests. Try again later.');
    this.name = 'OtpRateLimitError';
  }
}

export async function checkOtpSendRateLimit(phoneNumber: string): Promise<void> {
  const key = `otp:send:${phoneNumber}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  if (count > MAX_REQUESTS) {
    throw new OtpRateLimitError();
  }
}
