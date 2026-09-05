import 'dotenv/config';

// The retention sweep itself is replaced here, deliberately. What this file
// tests is the TRIGGER — that a burst of uploads produces one sweep and not one
// per request — and that property lives entirely in Redis. Mocking the sweep
// also keeps this suite off the database: the module under test never imports
// it, so there is no spec database to build for a test about a lock.
jest.mock('./quarantine-retention', () => ({
  QUARANTINE_RETENTION_DAYS: 30,
  sweepQuarantine: jest.fn(),
}));

import { redis } from '../lib/redis';
import { sweepQuarantine } from './quarantine-retention';
import {
  QUARANTINE_SWEEP_INTERVAL_MINUTES,
  QUARANTINE_SWEEP_LOCK_KEY,
  maybeSweepQuarantine,
} from './quarantine-sweep';

// Runs against the real Redis, exactly as upload-rate-limiter.spec.ts does. A
// mocked SET NX EX would only assert that the mock was called; the property
// worth proving — that two concurrent callers cannot both win — is a property of
// Redis, not of this file.
describe('maybeSweepQuarantine', () => {
  const mockSweep = jest.mocked(sweepQuarantine);

  const summary = {
    scanned: 3,
    candidates: 2,
    deleted: 1,
    awaitingReview: 1,
    untracked: 0,
    batchLimited: false,
  };

  beforeEach(async () => {
    mockSweep.mockReset();
    mockSweep.mockResolvedValue(summary);
    await redis.del(QUARANTINE_SWEEP_LOCK_KEY);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await redis.del(QUARANTINE_SWEEP_LOCK_KEY);
  });

  // Not async: `disconnect()` is synchronous, and leaving the connection open is
  // what makes Jest hang after the run completes.
  afterAll(() => {
    redis.disconnect();
  });

  it('sweeps once, and reports what it deleted', async () => {
    await expect(maybeSweepQuarantine()).resolves.toEqual(summary);
    expect(mockSweep).toHaveBeenCalledTimes(1);
  });

  it('runs once for a burst of concurrent uploads', async () => {
    // The real shape of the risk: a hundred citizens uploading at the same
    // moment must not start a hundred sweeps racing to unlink the same files.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => maybeSweepQuarantine()),
    );

    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(9);
  });

  it('does not sweep again until the window rolls over', async () => {
    await maybeSweepQuarantine();

    await expect(maybeSweepQuarantine()).resolves.toBeNull();
    expect(mockSweep).toHaveBeenCalledTimes(1);
  });

  it('gives the marker an expiry, so a next sweep is possible at all', async () => {
    await maybeSweepQuarantine();

    // -1 would mean the key never expires, which would turn "sweep every six
    // hours" into "sweep exactly once, ever" — silently, and only noticed when
    // the disk filled.
    const ttl = await redis.ttl(QUARANTINE_SWEEP_LOCK_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(QUARANTINE_SWEEP_INTERVAL_MINUTES * 60);
  });

  it('keeps the marker when the sweep fails, and never throws', async () => {
    // Called from the middle of a citizen reporting an emergency. No failure of
    // housekeeping justifies failing that request.
    mockSweep.mockRejectedValue(new Error('disk exploded'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(maybeSweepQuarantine()).resolves.toBeNull();
    // The interval is still burned. A sweep that fails every time must not
    // retry on every single upload — the next window is soon enough.
    expect(await redis.ttl(QUARANTINE_SWEEP_LOCK_KEY)).toBeGreaterThan(0);
  });
});
