import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from './multer.config';
import { assertStoredUpload, isStoredUpload } from './stored-upload';

// docs/_audit/issues.md issue 27. `POST /reports` used to store whatever photo
// URL the client sent, checked only by `z.string().url()` — a syntax check that
// `http://evil.com/tracker.png` passes. The mobile app renders that column
// directly, so one such row makes every citizen who opens the report fetch from
// a host we do not control.
//
// The predicate that closes it was lifted out of MissionsService, where it was
// private and hard-coded `${BETTER_AUTH_URL}/uploads/` as the only acceptable
// origin. Two of the cases below are the bugs that hard-coding caused, and they
// matter as much as the attack cases: a completion photo uploaded from a phone
// over the LAN was already being refused, and setting UPLOADS_PUBLIC_URL (which
// .env.example recommends) would have refused every mission completion outright.
describe('isStoredUpload', () => {
  const REAL_FILE = 'stored-upload-spec-fixture.jpg';
  const MISSING_FILE = 'stored-upload-spec-never-uploaded.jpg';

  const ENV_KEYS = [
    'UPLOADS_PUBLIC_URL',
    'BETTER_AUTH_URL',
    'EXPO_PUBLIC_API_URL',
  ] as const;

  let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeAll(() => {
    writeFileSync(
      join(UPLOADS_DIR, REAL_FILE),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  afterAll(() => {
    unlinkSync(join(UPLOADS_DIR, REAL_FILE));
  });

  beforeEach(() => {
    // Same discipline as upload-url.spec.ts: these tests write process.env, and
    // a leaked value silently changes which origins every later test trusts.
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

  describe('a URL this API really served', () => {
    it('accepts an upload on the API’s own declared origin', () => {
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}`),
      ).toBe(true);
    });

    // THE regression the old hard-coded prefix caused. A phone uploads through
    // EXPO_PUBLIC_API_URL, so its photo carries the LAN origin, and the mission
    // completion check refused it — on the one surface where the photo is the
    // evidence that the help actually happened.
    it('accepts an upload on EXPO_PUBLIC_API_URL, the origin a phone uploads through', () => {
      process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.5:3001';
      expect(
        isStoredUpload(`http://192.168.1.5:3001/uploads/${REAL_FILE}`),
      ).toBe(true);
    });

    // THE landmine. .env.example tells operators to set this; the old check
    // would then have refused every single completion photo.
    it('accepts an upload on UPLOADS_PUBLIC_URL once that is configured', () => {
      process.env.UPLOADS_PUBLIC_URL = 'http://localhost:3001';
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}`),
      ).toBe(true);
    });

    // Rows written before UPLOADS_PUBLIC_URL was introduced still point at the
    // old origin, and the mobile edit form resends them on every save.
    it('still accepts a BETTER_AUTH_URL row after UPLOADS_PUBLIC_URL is pointed elsewhere', () => {
      process.env.UPLOADS_PUBLIC_URL = 'https://cdn.uthavu.app';
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}`),
      ).toBe(true);
    });

    it('honours a base path on the configured origin', () => {
      process.env.UPLOADS_PUBLIC_URL = 'http://localhost:3001/media';
      expect(
        isStoredUpload(`http://localhost:3001/media/uploads/${REAL_FILE}`),
      ).toBe(true);
      expect(
        isStoredUpload(`http://localhost:3001/media/elsewhere/${REAL_FILE}`),
      ).toBe(false);
    });

    it('matches the host case-insensitively, as DNS does', () => {
      expect(
        isStoredUpload(`http://LOCALHOST:3001/uploads/${REAL_FILE}`),
      ).toBe(true);
    });

    // A TLS-terminating proxy legitimately turns an http origin into https on
    // the way out — upload-url.ts honours x-forwarded-proto for exactly that —
    // so pinning the scheme to the declared origin's would reject URLs this API
    // itself generated.
    it('does not require the scheme to match the declared origin’s', () => {
      expect(
        isStoredUpload(`https://localhost:3001/uploads/${REAL_FILE}`),
      ).toBe(true);
    });
  });

  describe('a URL the client made up', () => {
    it('rejects an off-origin host', () => {
      expect(isStoredUpload('http://evil.com/tracker.png')).toBe(false);
    });

    it('rejects an off-origin host even when it apes our path shape', () => {
      expect(isStoredUpload(`http://evil.com/uploads/${REAL_FILE}`)).toBe(
        false,
      );
    });

    it('is not fooled by a host that merely starts with a declared one', () => {
      process.env.BETTER_AUTH_URL = 'https://api.uthavu.app';
      expect(
        isStoredUpload(`https://api.uthavu.app.evil.com/uploads/${REAL_FILE}`),
      ).toBe(false);
    });

    it('treats the port as part of the identity', () => {
      expect(isStoredUpload(`http://localhost:9999/uploads/${REAL_FILE}`)).toBe(
        false,
      );
    });

    it('does not let a malformed configured origin become a wildcard', () => {
      process.env.BETTER_AUTH_URL = 'not a url';
      expect(isStoredUpload(`http://evil.com/uploads/${REAL_FILE}`)).toBe(
        false,
      );
    });

    // The whole point of the existsSync half: the origin is ours and the shape
    // is perfect, and the file was still never uploaded.
    it('rejects a well-formed URL for a file that does not exist', () => {
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${MISSING_FILE}`),
      ).toBe(false);
    });

    it('rejects a path outside /uploads/', () => {
      expect(isStoredUpload('http://localhost:3001/etc/passwd')).toBe(false);
      expect(isStoredUpload('http://localhost:3001/uploads')).toBe(false);
      expect(isStoredUpload('http://localhost:3001/uploads/')).toBe(false);
    });

    // `new URL` collapses these before we see them, so the URL arrives as
    // `/etc/passwd` and fails the prefix test rather than this one — asserted
    // anyway, because the collapsing is the reason it is safe.
    it('rejects a literal path traversal', () => {
      expect(
        isStoredUpload('http://localhost:3001/uploads/../../etc/passwd'),
      ).toBe(false);
    });

    // Percent-encoding is NOT collapsed by `new URL`, so this one reaches the
    // filename check intact. It is the traversal that actually gets here.
    it('rejects a percent-encoded path traversal', () => {
      expect(
        isStoredUpload('http://localhost:3001/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd'),
      ).toBe(false);
    });

    it('rejects a nested path under /uploads/', () => {
      expect(
        isStoredUpload(`http://localhost:3001/uploads/sub/${REAL_FILE}`),
      ).toBe(false);
    });

    it('rejects a scheme this API does not serve', () => {
      expect(isStoredUpload(`file:///uploads/${REAL_FILE}`)).toBe(false);
      expect(isStoredUpload('javascript:alert(1)')).toBe(false);
      expect(isStoredUpload('data:image/png;base64,AAAA')).toBe(false);
    });

    // buildUploadUrl never emits either, so anything carrying one was not built
    // by us — and it keeps a free-text tail out of a column other surfaces
    // concatenate into markup.
    it('rejects a query string or fragment', () => {
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}?x=1`),
      ).toBe(false);
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}#x`),
      ).toBe(false);
    });

    it('rejects a string that is not a URL at all', () => {
      expect(isStoredUpload('')).toBe(false);
      expect(isStoredUpload('/uploads/x.jpg')).toBe(false);
      expect(isStoredUpload('not a url')).toBe(false);
    });

    it('rejects everything when no origin is declared at all', () => {
      delete process.env.BETTER_AUTH_URL;
      expect(
        isStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}`),
      ).toBe(false);
    });
  });

  describe('assertStoredUpload', () => {
    it('throws a machine-readable code rather than a bare string', () => {
      expect.assertions(1);
      try {
        assertStoredUpload('http://evil.com/tracker.png');
      } catch (error) {
        expect((error as { response: unknown }).response).toMatchObject({
          code: 'INVALID_UPLOAD_URL',
        });
      }
    });

    // The rejected value is attacker-chosen text. Echoing it puts it in the
    // response the attacker reads and in whatever aggregates our logs.
    it('never echoes the rejected URL into the response or the log', () => {
      const hostile = 'http://evil.com/<script>alert(1)</script>.png';
      expect(() => assertStoredUpload(hostile)).toThrow();

      let thrown: unknown;
      try {
        assertStoredUpload(hostile);
      } catch (error) {
        thrown = error;
      }
      expect(JSON.stringify(thrown)).not.toContain('evil.com');
      expect((thrown as Error).message).not.toContain('evil.com');

      for (const call of (console.warn as jest.Mock).mock.calls) {
        expect(String(call[0])).not.toContain('evil.com');
      }
    });

    it('uses the caller’s wording when one is supplied', () => {
      expect(() =>
        assertStoredUpload(
          'http://evil.com/x.png',
          'The completion photo must be one uploaded through this app',
        ),
      ).toThrow('must be one uploaded through this app');
    });

    it('passes a genuine upload through silently', () => {
      expect(() =>
        assertStoredUpload(`http://localhost:3001/uploads/${REAL_FILE}`),
      ).not.toThrow();
    });
  });
});
