import { buildUploadUrl } from './upload-url';

// Two regressions are pinned here, and they pull in opposite directions.
//
// 2026-08-26: the URL was built from BETTER_AUTH_URL (http://localhost:3001 in
// dev), so an upload from a phone succeeded with HTTP 201 and handed back a URL
// pointing at the PHONE. Every photo was unreachable on-device. Verified live.
//
// 2026-09-02: the fix for that read `Host` verbatim — a caller-controlled
// header — so `Host: evil.com` persisted `http://evil.com/uploads/<uuid>.png`
// into `report_photos.url`, which mobile renders directly. The host must now
// match an origin this deployment declares; anything else falls back.
//
// The interesting cases are the ones where those two pressures meet: a LAN host
// the API knows about is still honoured, and one it does not is never stored.
describe('buildUploadUrl', () => {
  const req = (headers: Record<string, string>, protocol = 'http') =>
    ({
      protocol,
      headers,
      get: (h: string) => headers[h.toLowerCase()],
    }) as never;

  const ENV_KEYS = [
    'UPLOADS_PUBLIC_URL',
    'BETTER_AUTH_URL',
    'EXPO_PUBLIC_API_URL',
  ] as const;

  let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    // These tests write process.env, and a leaked value would silently change
    // which hosts every later test trusts — so snapshot, clear, and restore.
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.BETTER_AUTH_URL = 'http://localhost:3001';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  describe('a host this API declares', () => {
    it('uses the host the client actually reached the API on', () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001';
      expect(buildUploadUrl(req({ host: '192.168.1.5:3001' }), 'a.jpg')).toBe(
        'http://192.168.1.5:3001/uploads/a.jpg',
      );
    });

    it('never returns localhost when the client came in over a declared LAN address', () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001';
      expect(
        buildUploadUrl(req({ host: '192.168.1.5:3001' }), 'a.jpg'),
      ).not.toContain('localhost');
    });

    it('matches the host case-insensitively, as DNS does', () => {
      expect(buildUploadUrl(req({ host: 'LOCALHOST:3001' }), 'a.jpg')).toBe(
        'http://LOCALHOST:3001/uploads/a.jpg',
      );
    });

    // Vercel/any reverse proxy terminates TLS, so req.protocol is 'http' inside.
    it('honours x-forwarded-proto so a proxied deploy returns https, not http', () => {
      process.env.BETTER_AUTH_URL = 'https://api.uthavu.app';
      expect(
        buildUploadUrl(
          req({ host: 'api.uthavu.app', 'x-forwarded-proto': 'https' }),
          'a.jpg',
        ),
      ).toBe('https://api.uthavu.app/uploads/a.jpg');
    });

    it('takes only the first value when a proxy chain sends a list', () => {
      process.env.BETTER_AUTH_URL = 'https://api.uthavu.app';
      expect(
        buildUploadUrl(
          req({ host: 'api.uthavu.app', 'x-forwarded-proto': 'https, http' }),
          'a.jpg',
        ),
      ).toBe('https://api.uthavu.app/uploads/a.jpg');
    });

    // x-forwarded-proto is caller-controlled too, and the result is persisted.
    it('ignores a forwarded protocol that is not http or https', () => {
      expect(
        buildUploadUrl(
          req({ host: 'localhost:3001', 'x-forwarded-proto': 'javascript' }),
          'a.jpg',
        ),
      ).toBe('http://localhost:3001/uploads/a.jpg');
    });
  });

  describe('a host this API does not declare', () => {
    // THE case. An authenticated user controls this header; the result is
    // written to report_photos.url and fetched by every mobile client.
    it('never persists an attacker-supplied Host', () => {
      const url = buildUploadUrl(req({ host: 'evil.com' }), 'a.jpg');
      expect(url).toBe('http://localhost:3001/uploads/a.jpg');
      expect(url).not.toContain('evil.com');
    });

    it('is not fooled by a host that merely starts with a declared one', () => {
      process.env.BETTER_AUTH_URL = 'https://api.uthavu.app';
      expect(
        buildUploadUrl(
          req({
            host: 'api.uthavu.app.evil.com',
            'x-forwarded-proto': 'https',
          }),
          'a.jpg',
        ),
      ).toBe('https://api.uthavu.app/uploads/a.jpg');
    });

    it('treats the port as part of the identity', () => {
      expect(buildUploadUrl(req({ host: 'localhost:9999' }), 'a.jpg')).toBe(
        'http://localhost:3001/uploads/a.jpg',
      );
    });

    it('does not let a malformed configured origin become a wildcard', () => {
      process.env.BETTER_AUTH_URL = 'not a url';
      expect(buildUploadUrl(req({ host: 'evil.com' }), 'a.jpg')).not.toContain(
        'evil.com',
      );
    });

    // The fallback is deliberately silent to the caller, so the log is the only
    // way a genuinely misconfigured proxy is ever noticed.
    it('logs the rejected host so a real proxy misconfiguration is discoverable', () => {
      buildUploadUrl(req({ host: 'proxy.internal.example' }), 'a.jpg');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('proxy.internal.example'),
      );
    });
  });

  describe('UPLOADS_PUBLIC_URL', () => {
    it('prefers an explicit UPLOADS_PUBLIC_URL over the request host', () => {
      process.env.UPLOADS_PUBLIC_URL = 'https://cdn.uthavu.app';
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001';
      expect(buildUploadUrl(req({ host: '192.168.1.5:3001' }), 'a.jpg')).toBe(
        'https://cdn.uthavu.app/uploads/a.jpg',
      );
    });

    it('short-circuits the host check entirely, hostile header or not', () => {
      process.env.UPLOADS_PUBLIC_URL = 'https://cdn.uthavu.app';
      expect(buildUploadUrl(req({ host: 'evil.com' }), 'a.jpg')).toBe(
        'https://cdn.uthavu.app/uploads/a.jpg',
      );
    });

    it('does not double up slashes when the configured base URL has a trailing one', () => {
      process.env.UPLOADS_PUBLIC_URL = 'https://cdn.uthavu.app/';
      expect(buildUploadUrl(req({ host: 'x' }), 'a.jpg')).toBe(
        'https://cdn.uthavu.app/uploads/a.jpg',
      );
    });
  });

  it('falls back to BETTER_AUTH_URL when there is no Host header at all', () => {
    expect(buildUploadUrl(req({}), 'a.jpg')).toBe(
      'http://localhost:3001/uploads/a.jpg',
    );
  });
});
