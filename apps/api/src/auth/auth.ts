// Verified against the real Better Auth source (better-auth/plugins/phone-number)
// and public docs — not written from memory, per CLAUDE.md's Context7 requirement.
// Endpoints this exposes (mounted at BETTER_AUTH_URL + basePath, default /api/auth):
//   POST /api/auth/phone-number/send-otp  { phoneNumber }
//   POST /api/auth/phone-number/verify    { phoneNumber, code } -> { status, token, user }

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, phoneNumber } from 'better-auth/plugins';
import { db } from '../db';
import { Msg91OtpProvider } from './otp/msg91-otp.provider';
import { DevConsoleOtpProvider } from './otp/dev-console-otp.provider';
import { checkOtpSendRateLimit } from './otp/otp-rate-limiter';

// Temporary — see docs/decisions/0007-temporary-dev-otp-fallback.md. Real msg91
// credentials always win when present; the console fallback is hard-blocked in
// production so this can never silently ship a fake OTP to a real user.
const hasMsg91Credentials = Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);
if (!hasMsg91Credentials && process.env.NODE_ENV === 'production') {
  throw new Error(
    'MSG91_AUTH_KEY / MSG91_TEMPLATE_ID are required in production — refusing to start with the dev OTP fallback active.'
  );
}
const otpProvider = hasMsg91Credentials ? new Msg91OtpProvider() : new DevConsoleOtpProvider();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.ADMIN_URL, process.env.EXPO_PUBLIC_API_URL].filter(
    (v): v is string => Boolean(v)
  ),

  // docs/features/auth.md: single-tenant, no org concept — the user table only
  // needs discover-nearby-requests.md's location fields and a signup-completion
  // marker. `name`, `phoneNumber`, `phoneNumberVerified` are already built in.
  user: {
    additionalFields: {
      city: { type: 'string', required: false, input: false },
      district: { type: 'string', required: false, input: false },
      lastLat: { type: 'number', required: false, input: false },
      lastLng: { type: 'number', required: false, input: false },
      preferredRadius: { type: 'number', required: false, defaultValue: 5, input: false },
      // Null until PATCH /users/me completes signup (auth.md BR-5). More robust
      // than checking `name` truthiness — see the temp-name note below.
      profileCompletedAt: { type: 'date', required: false, input: false },

      // auth.md BR-5/BR-5a — the rest of Profile Setup's optional fields. All
      // `input: false`: they're only ever written via PATCH /users/me
      // (UsersService), never accepted directly through Better Auth's own
      // update-user endpoint.
      contactEmail: { type: 'string', required: false, input: false },
      language: { type: 'string', required: false, input: false },
      profession: { type: 'string', required: false, input: false },
      organization: { type: 'string', required: false, input: false },
      showProfession: { type: 'boolean', required: false, defaultValue: true, input: false },
      avatarUrl: { type: 'string', required: false, input: false },

      // The locale the server renders push notification prose in
      // (alerts/alert-templates.ts). Distinct from `language` above: that one
      // is free text the user typed about themselves and is display-only,
      // this one is a machine value ('en' | 'ta') the renderer switches on.
      // Null until the client reports one via PATCH /users/me/locale, which
      // falls back to English.
      locale: { type: 'string', required: false, input: false },
    },
  },

  plugins: [
    // Mobile has no cookie jar — this lets a stored session token be sent as
    // `Authorization: Bearer <token>` instead (docs.better-auth.com/plugins/bearer).
    // The admin console (session cookie, per CLAUDE.md) doesn't need this, but
    // registering it doesn't break cookie-based auth for that surface either.
    bearer(),
    phoneNumber({
      otpLength: 6,
      expiresIn: 300, // 5 min
      allowedAttempts: 5, // auth.md BR-2
      sendOTP: async ({ phoneNumber: to, code }) => {
        // auth.md BR-2: 3 sends per phone per rolling 10 min. Runs before msg91 is
        // touched, so a rate-limited request never costs real SMS money. Better
        // Auth's own `allowedAttempts` covers verify attempts, not send frequency —
        // this fills that specific gap. Thrown as a plain Error rather than
        // better-auth's internal APIError: this repo has two resolved copies of
        // @better-auth/core (a peer-version split from the drizzle adapter), so an
        // APIError built from the "wrong" copy risks not being recognized by the
        // framework's own error handling. Verify the exact surfaced status once
        // this is tested against a real client — a plain throw still correctly
        // blocks the send either way.
        await checkOtpSendRateLimit(to);
        await otpProvider.send(to, code);
      },
      // A verified phone with no prior account creates one immediately (no
      // separate "sign up" step — auth.md BR-1, unified login/signup). `name`
      // can't be left genuinely empty in Better Auth's schema, so it's seeded
      // with the phone number as a placeholder; profileCompletedAt (not `name`)
      // is what the client actually checks to route to Profile Setup.
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone.replace('+', '')}@phone.uthavu.local`,
        getTempName: (phone) => phone,
      },
    }),
  ],
});
