// The spoofing surface, tested at the unit level. rate-limit.http.spec.ts drives
// the same rules through a real Express stack with real headers, because the
// interesting part of this file is a claim about what Express does, and only
// Express can settle that.

import { clientIpFor, normalizeIp, trustProxyHops } from './client-ip';

describe('trustProxyHops', () => {
  it('defaults to 0 — X-Forwarded-For ignored — when unset', () => {
    // The single most important assertion in this file. 0 means Express reads
    // req.socket.remoteAddress and ignores the header, so an unset variable can
    // over-count but can never be spoofed.
    expect(trustProxyHops({})).toBe(0);
  });

  it('reads a configured hop count', () => {
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '1' })).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
  });

  it.each(['', '   ', 'true', 'yes', '-1', '1.5', 'NaN', 'Infinity'])(
    'falls back to 0 for %p rather than widening trust',
    (raw) => {
      // `true` is the value that matters here. Express accepts it and reads the
      // LEFT-most X-Forwarded-For entry, which is fully client-controlled — so
      // an operator who wrote TRUST_PROXY_HOPS=true expecting "yes, trust the
      // proxy" must get the safe reading, not the exploitable one.
      expect(trustProxyHops({ TRUST_PROXY_HOPS: raw })).toBe(0);
    },
  );
});

describe('normalizeIp', () => {
  it('collapses an IPv4-mapped IPv6 address onto its IPv4 form', () => {
    // Node reports IPv4 clients on a dual-stack listener as ::ffff:1.2.3.4
    // while a proxy header carries 1.2.3.4. Two spellings would be two buckets
    // for one machine.
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeIp('  ::FFFF:1.2.3.4 ')).toBe('1.2.3.4');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('leaves a plain address alone', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
  });
});

describe('clientIpFor', () => {
  it('uses req.ip, which Express has already resolved under trust proxy', () => {
    // Deliberately NOT parsing X-Forwarded-For here. Two places deciding which
    // hop to take is one place too many, and the one that disagreed quietly
    // would be the one keying the limiter.
    expect(clientIpFor({ ip: '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('falls back to the raw socket address when Express has no answer', () => {
    expect(clientIpFor({ socket: { remoteAddress: '203.0.113.9' } })).toBe(
      '203.0.113.9',
    );
  });

  it('normalises whatever it returns', () => {
    expect(clientIpFor({ ip: '::ffff:203.0.113.7' })).toBe('203.0.113.7');
  });

  it('buckets an unresolvable address rather than letting it through', () => {
    // Same call otp-rate-limiter.ts makes for an un-normalisable phone number:
    // refusing to count garbage would make garbage the cheapest bypass.
    expect(clientIpFor({})).toBe('unknown');
  });
});
