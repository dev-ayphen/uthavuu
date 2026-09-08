import 'dotenv/config';
import { redis } from '../lib/redis';
import { consumeRateLimit } from './rate-limit';

// Runs against the real Redis, exactly as otp-rate-limiter.spec.ts and
// upload-rate-limiter.spec.ts do. A mocked INCR/EXPIRE/TTL would only assert
// that the mock was called; the thing worth proving is that the counter and its
// expiry actually behave like a window, which is a property of Redis.
describe('consumeRateLimit', () => {
  // Unique per run so a previous run's leftover counter cannot fail this one.
  const prefix = `ratelimit-spec:${Date.now()}`;
  const keys: string[] = [];

  const keyFor = (name: string) => {
    const key = `${prefix}:${name}`;
    keys.push(key);
    return key;
  };

  afterAll(async () => {
    if (keys.length > 0) await redis.del(...keys);
    // Not inside an async teardown chain by accident: `disconnect()` is
    // synchronous, and leaving the connection open is what makes Jest hang
    // after the run completes.
    redis.disconnect();
  });

  it('allows requests up to the maximum', async () => {
    const key = keyFor('allow');
    for (let i = 1; i <= 3; i += 1) {
      const result = await consumeRateLimit(key, { max: 3, windowSeconds: 60 });
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(i);
      expect(result.retryAfterSeconds).toBe(0);
    }
  });

  it('refuses the request after the allowance is spent', async () => {
    const key = keyFor('refuse');
    for (let i = 0; i < 3; i += 1) {
      await consumeRateLimit(key, { max: 3, windowSeconds: 60 });
    }

    const result = await consumeRateLimit(key, { max: 3, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(4);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('sets an expiry so the window actually rolls over', async () => {
    const key = keyFor('ttl');
    await consumeRateLimit(key, { max: 3, windowSeconds: 60 });

    // -1 would mean the key never expires, which turns a rate limit into a
    // permanent ban on the fourth request the account ever makes.
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('does NOT extend the window on later hits', async () => {
    // A refreshed expiry would turn the fixed window into a rolling ban: a
    // caller who kept knocking would keep pushing their own reset away and
    // never recover. Asserted by watching the TTL fall rather than reset.
    const key = keyFor('no-refresh');
    await consumeRateLimit(key, { max: 100, windowSeconds: 5 });
    const first = await redis.pttl(key);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await consumeRateLimit(key, { max: 100, windowSeconds: 5 });
    const second = await redis.pttl(key);

    expect(second).toBeLessThan(first);
  });

  it('lets the caller through again once the window rolls over', async () => {
    const key = keyFor('rollover');
    await consumeRateLimit(key, { max: 1, windowSeconds: 1 });
    const refused = await consumeRateLimit(key, { max: 1, windowSeconds: 1 });
    expect(refused.allowed).toBe(false);

    // The key expires; the next call starts a fresh window.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const afterReset = await consumeRateLimit(key, {
      max: 1,
      windowSeconds: 1,
    });
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.used).toBe(1);
  });

  it('counts each key separately', async () => {
    const mine = keyFor('isolated-a');
    const yours = keyFor('isolated-b');

    for (let i = 0; i < 4; i += 1) {
      await consumeRateLimit(mine, { max: 3, windowSeconds: 60 });
    }
    expect(
      (await consumeRateLimit(mine, { max: 3, windowSeconds: 60 })).allowed,
    ).toBe(false);

    // A shared bucket would let one prolific caller lock out everyone else.
    expect(
      (await consumeRateLimit(yours, { max: 3, windowSeconds: 60 })).allowed,
    ).toBe(true);
  });

  it('propagates a Redis failure instead of deciding for its callers', async () => {
    // The single most consequential line in rate-limit.ts. The OTP and photo
    // limiters guard third-party bills and MUST fail closed on an unreachable
    // Redis; the guard and middleware shape traffic and MUST fail open. Neither
    // is possible if the primitive swallows the error, so it does not.
    const spy = jest
      .spyOn(redis, 'incr')
      .mockRejectedValueOnce(new Error('redis is down'));

    await expect(
      consumeRateLimit('never-written', { max: 1, windowSeconds: 60 }),
    ).rejects.toThrow('redis is down');

    spy.mockRestore();
  });
});
