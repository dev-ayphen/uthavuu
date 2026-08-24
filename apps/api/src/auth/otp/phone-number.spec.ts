import { normalizePhoneNumber } from './phone-number';

// Regression tests for the OTP rate-limit bypass found on 2026-08-24: the limiter
// keyed Redis on the raw client string, so '+919000055501', '919000055501',
// '0919000055501', '+91 9000055501' and '+919000055501 ' were five separate
// buckets for one real handset — 3 free sends each, with unbounded whitespace
// variants. One real phone must collapse to exactly one canonical string.
describe('normalizePhoneNumber', () => {
  const CANONICAL = '+919000055501';

  describe('collapses every spelling of one Indian mobile to a single E.164 string', () => {
    it.each([
      ['already canonical', '+919000055501'],
      ['no plus', '919000055501'],
      ['bare 10-digit subscriber number', '9000055501'],
      ['trunk-prefixed (STD 0)', '09000055501'],
      ['internal spaces', '+91 90000 55501'],
      ['hyphenated', '+91-90000-55501'],
      ['trailing whitespace', '+919000055501 '],
      ['leading whitespace', '  +919000055501'],
      ['parenthesised country code', '(+91) 9000055501'],
      ['dotted', '+91.90000.55501'],
      ['00 international prefix', '00919000055501'],
      ['tab and newline padding', '\t+919000055501\n'],
    ])('%s', (_label, input) => {
      expect(normalizePhoneNumber(input)).toBe(CANONICAL);
    });
  });

  describe('rejects anything that is not a real phone number', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['script injection', '<script>alert(1)</script>'],
      ['letters', 'not-a-phone'],
      ['too short', '+9190000'],
      ['too long', '+91900005550199999'],
      ['Indian mobile starting with 5', '+915000055501'],
      ['Indian mobile starting with 0', '+910000055501'],
      ['digits with embedded letters', '+9190000a5501'],
      ['plus only', '+'],
    ])('%s', (_label, input) => {
      expect(normalizePhoneNumber(input)).toBeNull();
    });

    it('rejects null and undefined input', () => {
      expect(normalizePhoneNumber(undefined as unknown as string)).toBeNull();
      expect(normalizePhoneNumber(null as unknown as string)).toBeNull();
    });

    it('rejects a non-string payload (a client can send anything)', () => {
      expect(
        normalizePhoneNumber({
          toString: () => '+919000055501',
        } as unknown as string),
      ).toBeNull();
    });
  });

  it('is idempotent — normalizing an already-normalized number is a no-op', () => {
    expect(normalizePhoneNumber(normalizePhoneNumber('9000055501')!)).toBe(
      CANONICAL,
    );
  });

  it('keeps genuinely different numbers distinct', () => {
    expect(normalizePhoneNumber('+919000055501')).not.toBe(
      normalizePhoneNumber('+919000055502'),
    );
  });

  it('accepts a non-Indian E.164 number unchanged (msg91 is India-first, not India-only)', () => {
    expect(normalizePhoneNumber('+1 415 555 0123')).toBe('+14155550123');
    expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
  });
});
