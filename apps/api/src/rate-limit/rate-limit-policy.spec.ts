// The two decisions the limiter makes, asserted directly.
//
// These are the rules a reviewer has to trust — which policy governs a route,
// and what a request is charged to — so they are tested as plain functions
// rather than only through a wired app. rate-limit.http.spec.ts then proves the
// guard actually executes on a real route; a green test here alone would prove
// only that the arithmetic is right in a file nothing calls.

import { RATE_LIMIT_POLICIES } from './rate-limit-config';
import {
  identityFor,
  isMutating,
  policyFor,
  rateLimitKey,
} from './rate-limit-policy';

describe('isMutating', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('treats %s as a write', (m) => {
    expect(isMutating(m)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('treats %s as a read', (m) => {
    expect(isMutating(m)).toBe(false);
  });

  it('is case-insensitive', () => {
    // Express normalises `req.method` to upper case, but the guard passes
    // through whatever it finds and a lower-case value must not silently
    // downgrade a write to the far more generous read policy.
    expect(isMutating('post')).toBe(true);
  });
});

describe('policyFor', () => {
  it('gives an undecorated citizen write the `write` default', () => {
    expect(policyFor({ method: 'POST', isAdminRoute: false })).toBe('write');
  });

  it('gives an undecorated citizen read the `read` default', () => {
    expect(policyFor({ method: 'GET', isAdminRoute: false })).toBe('read');
  });

  it('classifies admin mutations without any decorator', () => {
    // The product requirement is "all POST/PATCH/DELETE under /admin/*". There
    // are ~40 of them across 16 controllers; covering that by decorating each
    // one is covering it until somebody adds the forty-first.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(policyFor({ method, isAdminRoute: true })).toBe('admin-write');
    }
  });

  it('classifies admin reads separately from admin writes', () => {
    expect(policyFor({ method: 'GET', isAdminRoute: true })).toBe('admin-read');
  });

  it('lets a route declare a stricter policy than its method implies', () => {
    expect(
      policyFor({
        method: 'POST',
        isAdminRoute: false,
        declaredPolicy: 'report-create',
      }),
    ).toBe('report-create');
  });

  it('exempts only what explicitly asks to be exempt', () => {
    expect(
      policyFor({ method: 'GET', isAdminRoute: false, exempt: true }),
    ).toBe(null);
  });

  it('lets exemption win over a declared policy', () => {
    // Belt and braces: if a route somehow carries both, the exemption is the
    // more specific statement of intent and there is only one route that may
    // ever carry it (the health check).
    expect(
      policyFor({
        method: 'POST',
        isAdminRoute: false,
        declaredPolicy: 'write',
        exempt: true,
      }),
    ).toBe(null);
  });

  it('NEVER returns null for a route that did not ask to be exempt', () => {
    // The property that matters most in this file. A route added next month
    // with no decorator must land in a bucket, not in a gap. Exhaustive over
    // every combination the guard can produce.
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const isAdminRoute of [true, false]) {
        expect(policyFor({ method, isAdminRoute })).not.toBeNull();
      }
    }
  });

  it('only ever names a policy the config actually defines', () => {
    // A policy name with no entry in the table would throw at runtime inside
    // the guard, on the request that happened to hit that route.
    const named = new Set<string>(RATE_LIMIT_POLICIES);
    for (const method of ['GET', 'POST']) {
      for (const isAdminRoute of [true, false]) {
        const policy = policyFor({ method, isAdminRoute });
        expect(named.has(policy as string)).toBe(true);
      }
    }
  });
});

describe('identityFor', () => {
  it('keys an authenticated request on the session user id', () => {
    expect(identityFor({ userId: 'user-1', clientIp: '1.2.3.4' })).toEqual({
      key: 'u:user-1',
      basis: 'user',
    });
  });

  it('ignores the client IP entirely once a user is known', () => {
    // The anti-hop property, stated as an assertion: the same account reaching
    // the API from two networks shares ONE budget. If the IP leaked into the
    // key, moving networks (or spoofing one) would mint a fresh allowance.
    const fromHome = identityFor({ userId: 'user-1', clientIp: '1.2.3.4' });
    const fromMobile = identityFor({ userId: 'user-1', clientIp: '9.9.9.9' });
    expect(fromHome.key).toBe(fromMobile.key);
  });

  it('falls back to the client IP when there is no session', () => {
    expect(identityFor({ clientIp: '1.2.3.4' })).toEqual({
      key: 'ip:1.2.3.4',
      basis: 'ip',
    });
  });

  it.each([null, undefined, ''])(
    'treats %p as anonymous rather than as a user named "%p"',
    (userId) => {
      // An empty string is the dangerous one: `u:` would be a single shared
      // bucket for every request that failed to resolve a user, and truthiness
      // is the only thing standing between that and a real key.
      expect(identityFor({ userId, clientIp: '1.2.3.4' }).basis).toBe('ip');
    },
  );

  it('cannot confuse a user id with an IP', () => {
    // The `u:` / `ip:` prefixes exist for this: without them a user whose id
    // happened to be an IP-shaped string would share a bucket with that IP.
    expect(
      identityFor({ userId: '1.2.3.4', clientIp: '5.6.7.8' }).key,
    ).not.toBe(identityFor({ clientIp: '1.2.3.4' }).key);
  });
});

describe('rateLimitKey', () => {
  it('namespaces per policy so budgets do not bleed into each other', () => {
    const identity = identityFor({ userId: 'u1', clientIp: '1.2.3.4' });
    expect(rateLimitKey('read', identity)).toBe('ratelimit:read:u:u1');
    expect(rateLimitKey('write', identity)).toBe('ratelimit:write:u:u1');
  });

  it('cannot collide with either pre-existing limiter', () => {
    // otp-rate-limiter.ts owns `otp:send:*` and upload-rate-limiter.ts owns
    // `upload:report-photo:*`. A collision would not fail loudly — it would
    // quietly merge two unrelated budgets into one.
    const identity = identityFor({ userId: 'u1', clientIp: '1.2.3.4' });
    for (const policy of RATE_LIMIT_POLICIES) {
      const key = rateLimitKey(policy, identity);
      expect(key.startsWith('ratelimit:')).toBe(true);
      expect(key.startsWith('otp:')).toBe(false);
      expect(key.startsWith('upload:')).toBe(false);
    }
  });

  it('gives every policy a distinct key for one identity', () => {
    const identity = identityFor({ userId: 'u1', clientIp: '1.2.3.4' });
    const keys = RATE_LIMIT_POLICIES.map((p) => rateLimitKey(p, identity));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
