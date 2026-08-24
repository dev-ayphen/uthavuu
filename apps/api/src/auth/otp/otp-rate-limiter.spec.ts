import 'dotenv/config';
import { redis } from '../../lib/redis';
import { checkOtpSendRateLimit, OtpRateLimitError } from './otp-rate-limiter';

describe('checkOtpSendRateLimit', () => {
  const phoneNumber = `+91-test-rate-limiter-${Date.now()}`;
  const key = `otp:send:${phoneNumber}`;

  afterEach(async () => {
    await redis.del(key);
  });

  // Not async: `disconnect()` is synchronous, and leaving the connection open
  // is what makes Jest hang after the run completes.
  afterAll(() => {
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

    await expect(checkOtpSendRateLimit(phoneNumber)).rejects.toThrow(
      OtpRateLimitError,
    );
    await expect(checkOtpSendRateLimit(phoneNumber)).rejects.toThrow(
      'Too many OTP requests',
    );
  });

  // The mobile client shows a countdown on the "Resend OTP" button, so the error
  // has to say how long the wait is — otherwise the only honest UI is a dead button.
  it('reports how many seconds remain before the next send is allowed', async () => {
    await checkOtpSendRateLimit(phoneNumber);
    await checkOtpSendRateLimit(phoneNumber);
    await checkOtpSendRateLimit(phoneNumber);

    await expect(checkOtpSendRateLimit(phoneNumber)).rejects.toMatchObject({
      retryAfterSeconds: expect.any(Number) as number,
    });
    await checkOtpSendRateLimit(phoneNumber).catch((e: OtpRateLimitError) => {
      expect(e.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(10 * 60);
    });
  });

  it('sets a TTL on the counter key so it expires (does not rate-limit forever)', async () => {
    await checkOtpSendRateLimit(phoneNumber);
    const ttl = await redis.ttl(key);
    // -1 means no expiry was set, -2 means the key doesn't exist — both are bugs here.
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10 * 60);
  });

  // Regression: the 2026-08-24 bypass. The limiter keyed Redis on the raw client
  // string, so re-spelling the same handset bought another 3 sends every time.
  describe('one real handset gets one bucket, however the client spells it', () => {
    const canonical = '+919000055501';
    const variants = [
      '919000055501',
      '9000055501',
      '09000055501',
      '+91 90000 55501',
      '+919000055501 ',
    ];
    const keys = [canonical, ...variants].map((p) => `otp:send:${p}`);

    afterEach(async () => {
      await redis.del(...keys);
    });

    it('shares the 3-send allowance across every spelling', async () => {
      await checkOtpSendRateLimit(canonical);
      await checkOtpSendRateLimit(variants[0]);
      await checkOtpSendRateLimit(variants[1]);

      // The allowance is now spent — every remaining spelling must be refused.
      for (const variant of variants) {
        await expect(checkOtpSendRateLimit(variant)).rejects.toThrow(
          OtpRateLimitError,
        );
      }
      await expect(checkOtpSendRateLimit(canonical)).rejects.toThrow(
        OtpRateLimitError,
      );
    });

    it('stores the counter under the canonical key only', async () => {
      await checkOtpSendRateLimit('09000055501');

      expect(await redis.get(`otp:send:${canonical}`)).toBe('1');
      expect(await redis.get('otp:send:09000055501')).toBeNull();
    });
  });

  it('still rate-limits a value it cannot normalise, rather than letting it through', async () => {
    const garbage = `garbage-${Date.now()}`;
    try {
      await checkOtpSendRateLimit(garbage);
      await checkOtpSendRateLimit(garbage);
      await checkOtpSendRateLimit(garbage);
      await expect(checkOtpSendRateLimit(garbage)).rejects.toThrow(
        OtpRateLimitError,
      );
    } finally {
      await redis.del(`otp:send:${garbage}`);
    }
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
