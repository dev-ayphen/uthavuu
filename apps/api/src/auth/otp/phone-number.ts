// Canonicalises a client-supplied phone number to E.164 so that one real handset
// maps to exactly one string everywhere downstream.
//
// This is a security control, not a cosmetic tidy-up. `checkOtpSendRateLimit`
// keys Redis on the phone number, and Better Auth's phone-number plugin stores
// `ctx.body.phoneNumber` verbatim as the verification identifier AND as the
// `user.phone_number` column (better-auth/dist/plugins/phone-number/routes.mjs
// :157, :367). Without normalisation, '+919000055501', '919000055501',
// '0919000055501' and '+919000055501 ' are four separate rate-limit buckets —
// three free sends each, with unbounded whitespace variants — and four separate
// user rows for one person. Verified live on 2026-08-24; see the regression
// cases in phone-number.spec.ts.

// Separators a human (or a contact-picker) might include. Everything else is
// rejected rather than stripped — silently deleting unexpected characters is how
// '<script>alert(1)</script>' turns into a "valid" number.
const SEPARATORS = /[\s\-().]/g;

const INDIA_CC = '91';
// India mobile numbering: 10 digits, first digit 6-9. Landlines can't receive SMS,
// so an OTP to one is always a wasted msg91 credit.
const INDIA_MOBILE = /^[6-9]\d{9}$/;
// E.164 caps the whole number (country code included) at 15 digits; 8 is the
// shortest real-world assignment.
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/**
 * @returns the number as `+<digits>`, or `null` if it isn't a plausible phone
 *          number. Callers must treat `null` as "reject the request" — never as
 *          "pass the raw value through".
 */
export function normalizePhoneNumber(raw: string): string | null {
  if (typeof raw !== 'string') return null;

  const cleaned = raw.replace(SEPARATORS, '');
  // '00' is the ITU international access prefix — the dialled equivalent of '+'.
  const withPlus = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;

  const hasPlus = withPlus.startsWith('+');
  const digits = hasPlus ? withPlus.slice(1) : withPlus;
  if (!/^\d+$/.test(digits)) return null;

  const international = hasPlus ? digits : toInternational(digits);
  if (international === null) return null;

  // A '91' number is only valid if it's a real Indian mobile — this is what
  // rejects '+915000055501' and '+910000055501'.
  if (international.startsWith(INDIA_CC)) {
    const subscriber = international.slice(INDIA_CC.length);
    return INDIA_MOBILE.test(subscriber) ? `+${international}` : null;
  }

  if (
    international.length < E164_MIN_DIGITS ||
    international.length > E164_MAX_DIGITS
  )
    return null;
  return `+${international}`;
}

// Without a '+' the country code is guesswork, so only the three unambiguous
// Indian spellings are accepted. A bare foreign number (e.g. '14155550123') is
// rejected rather than guessed at — a wrong guess sends someone else's OTP.
function toInternational(digits: string): string | null {
  if (INDIA_MOBILE.test(digits)) return INDIA_CC + digits;
  if (digits.length === 11 && digits.startsWith('0')) {
    const subscriber = digits.slice(1);
    return INDIA_MOBILE.test(subscriber) ? INDIA_CC + subscriber : null;
  }
  if (digits.length === 12 && digits.startsWith(INDIA_CC)) return digits;
  return null;
}
