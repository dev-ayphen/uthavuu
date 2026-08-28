import { buildUploadUrl } from './upload-url';

// Regression for the 2026-08-26 finding: the controller built the returned URL
// from BETTER_AUTH_URL, which is http://localhost:3001 in dev. The upload itself
// succeeded (HTTP 201) but the URL handed back to the phone pointed at the PHONE,
// so every uploaded photo was unreachable on-device. Verified live.
describe('buildUploadUrl', () => {
  const req = (headers: Record<string, string>, protocol = 'http') =>
    ({ protocol, headers, get: (h: string) => headers[h.toLowerCase()] }) as never;

  it('uses the host the client actually reached the API on', () => {
    expect(buildUploadUrl(req({ host: '192.168.1.5:3001' }), 'a.jpg')).toBe(
      'http://192.168.1.5:3001/uploads/a.jpg'
    );
  });

  it('never returns localhost when the client came in over the LAN', () => {
    expect(buildUploadUrl(req({ host: '192.168.1.5:3001' }), 'a.jpg')).not.toContain('localhost');
  });

  // Vercel/any reverse proxy terminates TLS, so req.protocol is 'http' inside.
  it('honours x-forwarded-proto so a proxied deploy returns https, not http', () => {
    expect(
      buildUploadUrl(req({ host: 'api.uthavu.app', 'x-forwarded-proto': 'https' }), 'a.jpg')
    ).toBe('https://api.uthavu.app/uploads/a.jpg');
  });

  it('takes only the first value when a proxy chain sends a list', () => {
    expect(
      buildUploadUrl(req({ host: 'api.uthavu.app', 'x-forwarded-proto': 'https, http' }), 'a.jpg')
    ).toBe('https://api.uthavu.app/uploads/a.jpg');
  });

  it('prefers an explicit UPLOADS_PUBLIC_URL over the request host', () => {
    process.env.UPLOADS_PUBLIC_URL = 'https://cdn.uthavu.app';
    try {
      expect(buildUploadUrl(req({ host: '192.168.1.5:3001' }), 'a.jpg')).toBe(
        'https://cdn.uthavu.app/uploads/a.jpg'
      );
    } finally {
      delete process.env.UPLOADS_PUBLIC_URL;
    }
  });

  it('does not double up slashes when the configured base URL has a trailing one', () => {
    process.env.UPLOADS_PUBLIC_URL = 'https://cdn.uthavu.app/';
    try {
      expect(buildUploadUrl(req({ host: 'x' }), 'a.jpg')).toBe('https://cdn.uthavu.app/uploads/a.jpg');
    } finally {
      delete process.env.UPLOADS_PUBLIC_URL;
    }
  });

  it('falls back to BETTER_AUTH_URL when there is no Host header at all', () => {
    process.env.BETTER_AUTH_URL = 'http://localhost:3001';
    expect(buildUploadUrl(req({}), 'a.jpg')).toBe('http://localhost:3001/uploads/a.jpg');
  });
});
