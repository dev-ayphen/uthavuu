// The limits table: that the defaults are safe, that env overrides work, and
// that a mis-set variable can never widen a limit or disable the limiter.

import {
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_POLICIES,
  envVarNamesFor,
  rateLimitConfig,
} from './rate-limit-config';

describe('rateLimitConfig defaults', () => {
  it('is enabled when nothing is set', () => {
    // The requirement is that an unset environment is SAFE, not unlimited.
    expect(rateLimitConfig({}).enabled).toBe(true);
  });

  it('defines a usable window for every policy with no env at all', () => {
    const { policies } = rateLimitConfig({});
    for (const policy of RATE_LIMIT_POLICIES) {
      expect(policies[policy].max).toBeGreaterThan(0);
      expect(policies[policy].windowSeconds).toBeGreaterThan(0);
      expect(policies[policy].code).toBeTruthy();
      expect(policies[policy].message).toBeTruthy();
    }
  });

  it('keeps the per-IP layer looser than the per-user layer', () => {
    // Not cosmetic. The IP layer is shared by everyone behind one CGNAT address
    // — thousands of unrelated subscribers on an Indian mobile network — and it
    // is also the bucket everybody collapses into if TRUST_PROXY_HOPS is left
    // unset in production. If it were ever tightened below the per-user limits
    // it would become the binding constraint for legitimate traffic, which is
    // the one failure this table is shaped to avoid.
    const { policies } = rateLimitConfig({});
    const perMinute = (p: { max: number; windowSeconds: number }) =>
      (p.max / p.windowSeconds) * 60;

    expect(perMinute(policies['ip-global'])).toBeGreaterThan(
      perMinute(policies.read),
    );
    expect(perMinute(policies['ip-global'])).toBeGreaterThan(
      perMinute(policies['admin-read']),
    );
  });

  it('keeps report creation the tightest write in the product', () => {
    // POST /reports pushes a notification to every nearby volunteer, so its
    // abuse cost is other people's phones. It must never drift looser than the
    // generic write default.
    const { policies } = rateLimitConfig({});
    const perMinute = (p: { max: number; windowSeconds: number }) =>
      (p.max / p.windowSeconds) * 60;
    expect(perMinute(policies['report-create'])).toBeLessThan(
      perMinute(policies.write),
    );
  });
});

describe('rateLimitConfig env overrides', () => {
  it('derives predictable variable names', () => {
    expect(envVarNamesFor('report-create')).toEqual({
      max: 'RATE_LIMIT_REPORT_CREATE_MAX',
      window: 'RATE_LIMIT_REPORT_CREATE_WINDOW',
    });
    expect(envVarNamesFor('read')).toEqual({
      max: 'RATE_LIMIT_READ_MAX',
      window: 'RATE_LIMIT_READ_WINDOW',
    });
  });

  it('applies an override', () => {
    const { policies } = rateLimitConfig({
      RATE_LIMIT_REPORT_CREATE_MAX: '9',
      RATE_LIMIT_REPORT_CREATE_WINDOW: '120',
    });
    expect(policies['report-create'].max).toBe(9);
    expect(policies['report-create'].windowSeconds).toBe(120);
  });

  it('overrides one policy without disturbing the others', () => {
    const { policies } = rateLimitConfig({ RATE_LIMIT_WRITE_MAX: '7' });
    expect(policies.write.max).toBe(7);
    expect(policies.read.max).toBe(RATE_LIMIT_DEFAULTS.read.max);
  });

  it('has an env override for EVERY policy', () => {
    // A policy that could not be tuned without a redeploy would be a policy
    // nobody tunes — the whole reason these numbers are not inline constants.
    for (const policy of RATE_LIMIT_POLICIES) {
      const names = envVarNamesFor(policy);
      const { policies } = rateLimitConfig({
        [names.max]: '11',
        [names.window]: '13',
      });
      expect(policies[policy].max).toBe(11);
      expect(policies[policy].windowSeconds).toBe(13);
    }
  });

  it.each(['0', '-5', 'abc', '', '   ', '1.5', 'Infinity'])(
    'falls back to the documented default for %p',
    (raw) => {
      // `0` is the interesting one: somebody setting RATE_LIMIT_READ_MAX=0
      // almost certainly means "no limit" and would instead have refused every
      // read in the product. Falling back is the only outcome that is never
      // catastrophic in either direction.
      const { policies } = rateLimitConfig({ RATE_LIMIT_READ_MAX: raw });
      expect(policies.read.max).toBe(RATE_LIMIT_DEFAULTS.read.max);
    },
  );
});

describe('the kill switch', () => {
  it('is off unless explicitly set to true', () => {
    for (const raw of [undefined, '', 'false', '0', 'no', 'TRUE ']) {
      const env = raw === undefined ? {} : { RATE_LIMIT_DISABLED: raw };
      // 'TRUE ' is trimmed and lower-cased, so it DOES disable — asserted
      // separately below. Everything else must leave enforcement on.
      if (raw === 'TRUE ') continue;
      expect(rateLimitConfig(env).enabled).toBe(true);
    }
  });

  it('accepts an explicit true, case- and whitespace-insensitively', () => {
    expect(rateLimitConfig({ RATE_LIMIT_DISABLED: 'true' }).enabled).toBe(
      false,
    );
    expect(rateLimitConfig({ RATE_LIMIT_DISABLED: ' TRUE ' }).enabled).toBe(
      false,
    );
  });

  it('cannot be tripped by a limit variable', () => {
    // There is exactly one spelling for "turn this off", and it is not a zero
    // hidden in a limit.
    expect(
      rateLimitConfig({
        RATE_LIMIT_READ_MAX: '0',
        RATE_LIMIT_WRITE_MAX: '0',
      }).enabled,
    ).toBe(true);
  });
});
