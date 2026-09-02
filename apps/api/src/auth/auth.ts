// Verified against the real Better Auth source (better-auth/plugins/phone-number)
// and public docs — not written from memory, per CLAUDE.md's Context7 requirement.
// Endpoints this exposes (mounted at BETTER_AUTH_URL + basePath, default /api/auth):
//   POST /api/auth/phone-number/send-otp  { phoneNumber }
//   POST /api/auth/phone-number/verify    { phoneNumber, code } -> { status, token, user }

import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, phoneNumber } from 'better-auth/plugins';
import { db } from '../db';
import { decideSessionCreate } from '../account-status/login-block';
import { Msg91OtpProvider } from './otp/msg91-otp.provider';
import { DevConsoleOtpProvider } from './otp/dev-console-otp.provider';
import {
  checkOtpSendRateLimit,
  OtpRateLimitError,
} from './otp/otp-rate-limiter';
import { otpRateLimitApiError } from './otp/otp-api-error';
import { normalizePhoneNumber } from './otp/phone-number';

// Temporary — see docs/decisions/0007-temporary-dev-otp-fallback.md. Real msg91
// credentials always win when present; the console fallback is hard-blocked in
// production so this can never silently ship a fake OTP to a real user.
const hasMsg91Credentials = Boolean(
  process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID,
);
if (!hasMsg91Credentials && process.env.NODE_ENV === 'production') {
  throw new Error(
    'MSG91_AUTH_KEY / MSG91_TEMPLATE_ID are required in production — refusing to start with the dev OTP fallback active.',
  );
}
const otpProvider = hasMsg91Credentials
  ? new Msg91OtpProvider()
  : new DevConsoleOtpProvider();

// The two routes that take a client-supplied phone number in this product. Read
// off the plugin's own `createAuthEndpoint(...)` calls
// (better-auth/dist/plugins/phone-number/routes.mjs:132, :238) — `ctx.path` in a
// before-hook is the endpoint path, not the mounted URL, so there is no
// '/api/auth' prefix here (dispatch.mjs:201 sets `path: endpoint.path`).
// `/sign-in/phone-number` and the password-reset pair are deliberately absent:
// Uthavu has no phone+password login, so those routes are never exercised, and
// listing a path we don't use would imply a guarantee nothing tests.
const PHONE_NUMBER_PATHS = new Set([
  '/phone-number/send-otp',
  '/phone-number/verify',
]);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.ADMIN_URL,
    process.env.EXPO_PUBLIC_API_URL,
  ].filter((v): v is string => Boolean(v)),

  // CLAUDE.md § Stack: "Admin: session-based login." The admin console signs in
  // with email + password and rides a session cookie; mobile stays on phone +
  // OTP with a Bearer token. Both are Better Auth sessions, so one guard
  // resolves either — see admin/admin.guard.ts.
  //
  // `disableSignUp` is the load-bearing line. Enabling email+password without
  // it would publish POST /api/auth/sign-up/email to the internet, letting
  // anyone mint a `user` row. That would not grant admin access (an admin is a
  // row in `admin_users`, and nothing self-service writes one), but it would be
  // an open registration endpoint on a product where the ONLY way to become a
  // user is to verify a real phone number over real SMS. Admin accounts are
  // provisioned by `pnpm db:seed`; there is no self-registration path.
  //
  // Existing phone users are unaffected: sign-up-on-verify creates them with a
  // synthetic @phone.uthavu.local address and no credential account, so
  // /sign-in/email finds no password to check and refuses them — as it should.
  //
  // Note there is deliberately NO password reset flow: /forget-password returns
  // 400 RESET_PASSWORD_DISABLED because `sendResetPassword` is unset, and it is
  // unset because this project has no email provider
  // (docs/decisions/0003-no-email-provider-at-launch.md). Rotate a seeded
  // admin's password with SEED_ADMIN_FORCE_PASSWORD_RESET=true pnpm db:seed.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },

  // Better Auth enables rate limiting on production only (its documented
  // default), so this rule is a production-only tightening and changes nothing
  // in dev or in the test suite. It exists because /sign-in/email is the one
  // endpoint in this API where guessing repeatedly is worth an attacker's time:
  // the phone OTP routes already have their own Redis limiter
  // (auth/otp/otp-rate-limiter.ts), and everything else needs a session first.
  //
  // Storage is Better Auth's in-memory default, which is per-process. That is
  // honest protection for the single API container this project runs today and
  // stops being sufficient the moment it is scaled horizontally — at which
  // point this needs `storage: 'secondary-storage'` backed by the Redis that is
  // already in the stack.
  rateLimit: {
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
  },

  // ACCOUNT SUSPENSION — the login half of the block (owner decision,
  // 2026-08-28; see db/schema/user-status-schema.ts for the full rule).
  //
  // `session.create.before` is the right seam because it is the ONE chokepoint
  // every sign-in path passes through: admin email+password, mobile phone-OTP
  // verify, and any future provider all end in a session row being written.
  // Hooking the individual sign-in routes instead would mean remembering to add
  // the next one. This is also exactly how Better Auth's own admin plugin
  // enforces `user.banned` (better-auth/dist/plugins/admin/admin.mjs:33-49) —
  // verified by reading the installed 1.7.1 source, not recalled.
  //
  // Uthavu does not use that plugin (it brings a whole parallel role system
  // this project deliberately models in `admin_users` instead), so the hook is
  // ours; the placement is borrowed because it is correct.
  //
  // Throwing APIError here aborts session creation, so a suspended user never
  // receives a token or a cookie. The FORBIDDEN + ACCOUNT_SUSPENDED pair is the
  // same status/code the request guard returns, so a client has one case to
  // handle rather than two.
  //
  // The DECISION lives in account-status/login-block.ts, not here. Everything
  // this module imports is ESM-only, so a spec cannot load this file under the
  // package's CommonJS Jest transform, and the rule that decides whether a
  // person may sign in had no test at all while it lived inline. Down there it
  // is a plain function returning a plain result; up here all that is left is
  // mapping that result onto the library's error type. See login-block.ts for
  // the full reasoning.
  databaseHooks: {
    session: {
      create: {
        before: async (session: { userId: string }) => {
          const decision = await decideSessionCreate(session);
          if (!decision.allowed) {
            throw APIError.from(decision.status, decision.error);
          }
        },
      },
    },
  },

  // docs/features/auth.md: single-tenant, no org concept — the user table only
  // needs discover-nearby-requests.md's location fields and a signup-completion
  // marker. `name`, `phoneNumber`, `phoneNumberVerified` are already built in.
  user: {
    additionalFields: {
      city: { type: 'string', required: false, input: false },
      district: { type: 'string', required: false, input: false },
      lastLat: { type: 'number', required: false, input: false },
      lastLng: { type: 'number', required: false, input: false },
      preferredRadius: {
        type: 'number',
        required: false,
        defaultValue: 5,
        input: false,
      },
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
      showProfession: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
      avatarUrl: { type: 'string', required: false, input: false },

      // The locale the server renders push notification prose in
      // (alerts/alert-templates.ts). Distinct from `language` above: that one
      // is free text the user typed about themselves and is display-only,
      // this one is a machine value ('en' | 'ta') the renderer switches on.
      // Null until the client reports one via PATCH /users/me/locale, which
      // falls back to English.
      locale: { type: 'string', required: false, input: false },

      // Profile → Invite Friends. Null until first requested — UsersService
      // lazy-generates and persists an 8-char code on first `GET
      // /users/me/invite` (same lazy-check style MissionsService's
      // expireStaleAndListVolunteers already uses), never accepted directly
      // through Better Auth's own update-user endpoint.
      inviteCode: { type: 'string', required: false, input: false },

      // Settings → Privacy. Pre-fills the anonymous/phoneVisible toggles on
      // the NEXT report someone creates — does not retroactively change any
      // already-published report. Written only via PATCH /users/me/privacy.
      defaultAnonymous: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
      defaultPhoneVisible: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },

  // Canonicalise the phone number BEFORE any route handler sees it. This has to
  // happen here rather than inside `sendOTP`, because the plugin writes
  // `ctx.body.phoneNumber` verbatim in two places the callback can't reach: the
  // verification identifier (routes.mjs:157) and the `user.phone_number` column
  // on signup-at-verify (routes.mjs:367). Without it, '+919000055501' and
  // '919000055501' are two verification identifiers and two user rows for one
  // handset — and, before the limiter was fixed, two rate-limit buckets.
  //
  // `hooks.before` is a SINGLE middleware here, not the array-of-matchers shape
  // plugins use: `getHooks` pushes `options.hooks.before` with a
  // `matcher: () => true` (dispatch.mjs:139-145), so the path check is ours to
  // do. Returning `{ context: { ... } }` merges into the request context via
  // `defuReplaceArrays` (dispatch.mjs:207-216); returning nothing leaves the
  // request untouched.
  hooks: {
    // The hook has no async work of its own, but `createAuthMiddleware` types
    // the handler as returning a Promise, so it must be declared async.
    // eslint-disable-next-line @typescript-eslint/require-await
    before: createAuthMiddleware(async (ctx) => {
      if (!PHONE_NUMBER_PATHS.has(ctx.path)) return;

      // `ctx.body` is `any` at this point (the hook runs for every endpoint, so
      // it has no single body type). Narrowing it to an index signature keeps
      // the spread below type-safe.
      const body = ctx.body as Record<string, unknown> | undefined;
      const raw = body?.phoneNumber;
      if (typeof raw !== 'string') return;

      const normalized = normalizePhoneNumber(raw);
      // Un-normalisable input is NOT rejected here — `phoneNumberValidator`
      // below owns that, and it produces Better Auth's own BAD_REQUEST /
      // INVALID_PHONE_NUMBER (routes.mjs:151-152) instead of a bespoke error
      // shape. Rejecting in two places would mean two different 400 bodies for
      // the same mistake.
      if (normalized === null || normalized === raw) return;

      return { context: { body: { ...body, phoneNumber: normalized } } };
    }),
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
      // Better Auth's own body schema is a bare `z.string()`, so without this
      // '' and '<script>alert(1)</script>' both returned 200 "code sent"
      // (verified live 2026-08-24). The plugin calls this and throws
      // BAD_REQUEST / INVALID_PHONE_NUMBER on false (routes.mjs:151-152).
      //
      // Scope, precisely: the plugin checks this in `/phone-number/send-otp`
      // (routes.mjs:151) and `/sign-in/phone-number` (routes.mjs:55) — NOT in
      // `/phone-number/verify`, which has no validator call at all. That is
      // acceptable because verify's job is matching a stored verification
      // identifier: a number that can't normalise was never able to create one,
      // so it fails as an invalid OTP rather than being let through. The
      // endpoint that costs money is the one that is guarded.
      //
      // Runs AFTER the before-hook above, so it sees the canonical form.
      phoneNumberValidator: (phone) => normalizePhoneNumber(phone) !== null,
      sendOTP: async ({ phoneNumber: to, code }) => {
        // auth.md BR-2: 3 sends per phone per rolling 10 min. Runs before msg91 is
        // touched, so a rate-limited request never costs real SMS money. Better
        // Auth's own `allowedAttempts` covers verify attempts, not send frequency —
        // this fills that specific gap.
        //
        // The limiter throws a plain Error, and a plain Error thrown in here is
        // an unhandled fault to Better Auth: tested against a real client on
        // 2026-08-24, the 4th send came back HTTP 500 with a ZERO-LENGTH body,
        // so the client could not tell "slow down" from "the server fell over"
        // and had nothing to put on the resend button. `otpRateLimitApiError`
        // re-throws it in the shape the dispatcher serialises as a real 429 with
        // a body and a Retry-After header — see otp-api-error.ts for why that is
        // a duck-typed object rather than `new APIError(...)`.
        //
        // Only OtpRateLimitError is translated. Anything else (a dead Redis, a
        // bug in here) must keep bubbling as a genuine 500 — dressing an
        // infrastructure failure up as "you're going too fast" would hide an
        // outage behind a retry countdown.
        try {
          await checkOtpSendRateLimit(to);
        } catch (err) {
          if (err instanceof OtpRateLimitError) throw otpRateLimitApiError(err);
          throw err;
        }
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
