// Matches Better Auth's real phone-number plugin endpoints (verified against
// better-auth source, not guessed — see apps/api/src/auth/auth.ts):
//   POST /api/auth/phone-number/send-otp { phoneNumber }
//   POST /api/auth/phone-number/verify   { phoneNumber, code } -> { status, token, user }
// Error codes are Better Auth's own (PHONE_NUMBER_ERROR_CODES): OTP_EXPIRED,
// INVALID_OTP, OTP_NOT_FOUND, TOO_MANY_ATTEMPTS.

import { apiRequest } from '../lib/api';

export type AuthUser = {
  id: string;
  phoneNumber: string;
  name: string;
  city: string | null;
  district: string | null;
  lastLat: number | null;
  lastLng: number | null;
  preferredRadius: 1 | 3 | 5 | 10;
  profileCompletedAt: string | null;
  // auth.md BR-5/BR-5a — optional Profile Setup fields, all nullable until filled.
  contactEmail: string | null;
  language: string | null;
  profession: string | null;
  organization: string | null;
  showProfession: boolean;
  avatarUrl: string | null;
  // Settings → Privacy. Pre-fill defaults for the next report's toggles.
  defaultAnonymous: boolean;
  defaultPhoneVisible: boolean;
};

export type VerifyOtpResult = {
  status: boolean;
  token: string | null;
  user: AuthUser;
};

// Better Auth expects E.164-ish numbers (its own docs example: "+1234567890").
// The Login screen collects a bare 10-digit Indian number; +91 is added here,
// once, at the API boundary — not stored or displayed with it anywhere else.
function toE164(phone: string): string {
  return `+91${phone}`;
}

export function requestOtp(phone: string): Promise<void> {
  return apiRequest('/api/auth/phone-number/send-otp', {
    method: 'POST',
    body: { phoneNumber: toE164(phone) },
  });
}

export function verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  return apiRequest('/api/auth/phone-number/verify', {
    method: 'POST',
    body: { phoneNumber: toE164(phone), code },
  });
}

// profileCompletedAt (not `name`) is the source of truth for "has this user
// finished signup" — Better Auth seeds `name` with the phone number as a
// placeholder on first verification (see signUpOnVerification in auth.ts), so
// name truthiness can't tell new and returning users apart.
export function isProfileIncomplete(user: AuthUser): boolean {
  return !user.profileCompletedAt;
}

export function logout(): Promise<void> {
  return apiRequest('/api/auth/sign-out', { method: 'POST', auth: true });
}
