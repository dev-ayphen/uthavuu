import 'dotenv/config';
import { redis } from '../../lib/redis';
import { checkOtpSendRateLimit, OtpRateLimitError } from './otp-rate-limiter';

describe('checkOtpSendRateLimit', () => {
  const phoneNumber = `+91-test-rate-limiter-${Date.now()}`;
  const key = `otp:send:${phoneNumber}`;

  afterEach(async () => {
    await redis.del(key);
  });

  afterAll(async () => {
    redis.disconnect();
  });

  it('allows up to 3 requests within the window', async () => {
    await expect(checkOtpSendRateLimit(phoneNumber)).resolves.toBeUndefined();
    await expect(checkOtpSendRateLimit(phoneNumber)).resolves.toBeUndefined();
    await expect(checkOtpSendRateLimit(phoneNumber)).resolves.toBeUndefined();
  });

  it('rejects the 4th request within the window', async () => {
    await checkOtpSendRateLimit(phoneNumber);
    await checkOtpSendRateLimit(phoneNumber);
    await checkOtpSendRateLimit(phoneNumber);

    await expect(checkOtpSendRateLimit(phoneNumber)).rejects.toThrow(OtpRateLimitError);
    await expect(checkOtpSendRateLimit(phoneNumber)).rejects.toThrow('Too many OTP requests');
  });

  it('sets a TTL on the counter key so it expires (does not rate-limit forever)', async () => {
    await checkOtpSendRateLimit(phoneNumber);
    const ttl = await redis.ttl(key);
    // -1 means no expiry was set, -2 means the key doesn't exist — both are bugs here.
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10 * 60);
  });

  it('tracks each distinct phone number independently', async () => {
    const otherPhone = `${phoneNumber}-other`;
    try {
      await checkOtpSendRateLimit(phoneNumber);
      await checkOtpSendRateLimit(phoneNumber);
      await checkOtpSendRateLimit(phoneNumber);
      // phoneNumber is now at its limit; a different phone number must be unaffected.
      await expect(checkOtpSendRateLimit(otherPhone)).resolves.toBeUndefined();
    } finally {
      await redis.del(`otp:send:${otherPhone}`);
    }
  });
});
