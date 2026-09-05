import 'dotenv/config';
import { redis } from '../lib/redis';
import {
  UploadRateLimitError,
  checkUploadRateLimit,
} from './upload-rate-limiter';

// Runs against the real Redis, exactly as otp-rate-limiter.spec.ts does. A
// mocked INCR/EXPIRE/TTL would only assert that the mock was called; the thing
// worth proving is that the counter and its expiry actually behave like a
// rolling window, which is a property of Redis, not of this file.
describe('checkUploadRateLimit', () => {
  // Unique per run so a previous run's leftover counter cannot fail this one.
  const userId = `upload-rate-limiter-spec-${Date.now()}`;
  const key = `upload:report-photo:${userId}`;
  const MAX_UPLOADS = 20;

  afterEach(async () => {
    await redis.del(key);
  });

  // Not async: `disconnect()` is synchronous, and leaving the connection open is
  // what makes Jest hang after the run completes.
  afterAll(() => {
    redis.disconnect();
  });

  it('allows a full report of photos plus retakes', async () => {
    for (let i = 0; i < MAX_UPLOADS; i += 1) {
      await expect(checkUploadRateLimit(userId)).resolves.toBeUndefined();
    }
  });

  it('refuses the request after the allowance is spent', async () => {
    for (let i = 0; i < MAX_UPLOADS; i += 1) {
      await checkUploadRateLimit(userId);
    }

    await expect(checkUploadRateLimit(userId)).rejects.toThrow(
      UploadRateLimitError,
    );
    await expect(checkUploadRateLimit(userId)).rejects.toThrow(
      'Too many photo uploads',
    );
  });

  it('reports how long the caller must wait', async () => {
    for (let i = 0; i <= MAX_UPLOADS; i += 1) {
      await checkUploadRateLimit(userId).catch(() => undefined);
    }

    await expect(checkUploadRateLimit(userId)).rejects.toMatchObject({
      retryAfterSeconds: expect.any(Number) as number,
    });

    const error = await checkUploadRateLimit(userId).catch(
      (caught: UploadRateLimitError) => caught,
    );
    expect(error).toBeInstanceOf(UploadRateLimitError);
    expect((error as UploadRateLimitError).retryAfterSeconds).toBeGreaterThan(
      0,
    );
  });

  it('counts each account separately', async () => {
    // A shared bucket would let one prolific reporter lock out an entire city.
    const other = `${userId}-other`;
    const otherKey = `upload:report-photo:${other}`;

    try {
      for (let i = 0; i < MAX_UPLOADS; i += 1) {
        await checkUploadRateLimit(userId);
      }
      await expect(checkUploadRateLimit(userId)).rejects.toThrow(
        UploadRateLimitError,
      );

      await expect(checkUploadRateLimit(other)).resolves.toBeUndefined();
    } finally {
      await redis.del(otherKey);
    }
  });

  it('sets an expiry so the window actually rolls over', async () => {
    await checkUploadRateLimit(userId);

    // -1 would mean the key never expires, which would turn a rate limit into a
    // permanent ban after the twentieth photo the account ever uploads.
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
  });
});
