// Every rate limit this API enforces, in one place, all overridable by env.
//
// WHY NOT NUMBERS IN CONTROLLERS. Same reasoning moderation-thresholds.ts gives
// for its numbers: a limit is a policy, and the right value is discovered in
// production by watching what real users actually do. A number inlined at a call
// site is a number nobody tunes, and tuning it under load should not require a
// redeploy of an emergency-help service. Controllers name a POLICY
// (@RateLimit('report-create')); this file decides what that policy costs.
//
// DEFAULTS ARE SAFE, NOT UNLIMITED. Every policy below has a working default, so
// an unset variable is a sane limit rather than an open door. Only `RATE_LIMIT_
// DISABLED` can turn enforcement off, and it is named in the negative on
// purpose: the safe state is what you get when nothing is set, and no typo in a
// value can disable protection.
//
// ── SIZING, AND THE ONE CONSTRAINT THAT SHAPED IT ───────────────────────────
// Uthavu's users are in Tamil Nadu on Indian mobile networks, which are heavily
// CGNAT'd: thousands of unrelated subscribers can share one public IPv4 address.
// That single fact decides the whole shape of the table.
//
// It means an IP is a TERRIBLE identity for a tight limit — a strict per-IP rule
// would lock a whole carrier out of an emergency service — and a per-user id is
// an excellent one. So:
//
//   * The per-IP layer (middleware, pre-authentication) is deliberately
//     GENEROUS. Its job is not precision. It bounds anonymous floods and caps
//     how fast one machine can cycle identities, and nothing else.
//   * The per-user layer (guard, post-authentication) is where the real limits
//     live, because a user id is a precise identity that costs a verified phone
//     number to obtain.
//
// A deployment on non-CGNAT infrastructure should tighten `ip-global` and `auth`
// considerably; the defaults here are sized for the network the product ships on.

import { RATE_LIMITED } from '@uthavu/libs-common';
import type { RateLimitWindow } from './rate-limit';

/**
 * The policies a route can be assigned. The names are the contract between
 * @RateLimit() at a call site and the numbers below.
 */
export const RATE_LIMIT_POLICIES = [
  'ip-global',
  'auth',
  'report-create',
  'mission-chat',
  'comment',
  'support-ticket',
  'avatar-upload',
  'write',
  'read',
  'admin-write',
  'admin-read',
] as const;

export type RateLimitPolicy = (typeof RATE_LIMIT_POLICIES)[number];

/** What a caller is told when a policy refuses them. */
export interface PolicyDefinition extends RateLimitWindow {
  /** Machine-readable code the client branches on. */
  readonly code: string;
  /** Server-authored prose. Mobile renders its own localised copy. */
  readonly message: string;
}

const TOO_FAST = 'Too many requests. Please slow down and try again shortly.';

/**
 * The defaults, with the reasoning for each. Read this table as "what does a
 * real person legitimately do in this window", never as "what feels round".
 */
const DEFAULTS: Record<RateLimitPolicy, PolicyDefinition> = {
  // ── Per-IP, enforced before authentication (rate-limit.middleware.ts) ─────

  /**
   * The outermost ceiling: every request that reaches the process, signed in or
   * not, static asset or API call.
   *
   * 600/min sounds enormous and is meant to. Behind CGNAT this bucket may be
   * shared by an entire neighbourhood, and it is also the bucket that absorbs
   * the misconfiguration where TRUST_PROXY_HOPS is unset in production and
   * EVERY user collapses into one entry (client-ip.ts explains why that is the
   * safe direction to fail). It still bounds the two things it exists for: a
   * single machine flooding unauthenticated requests at a protected route
   * (which costs a Better Auth session lookup per attempt before any Nest guard
   * runs), and identity-cycling — no amount of switching accounts gets one
   * origin past 600 requests a minute.
   */
  'ip-global': {
    max: 600,
    windowSeconds: 60,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * Everything under the Better Auth base path: OTP send, OTP verify, admin
   * sign-in/email, session reads.
   *
   * This is a BACKSTOP, not the primary anti-brute-force control, and the
   * distinction is load-bearing. The precise controls are keyed on things a
   * client cannot vary: 3 OTP sends per PHONE NUMBER per 10 minutes
   * (auth/otp/otp-rate-limiter.ts) and 5 verify attempts per verification
   * (Better Auth's `allowedAttempts`). Those are correct under CGNAT because
   * they are not keyed on the network. This one catches what they cannot see —
   * one host walking through many phone numbers or many admin passwords.
   *
   * 100 per 5 minutes: a real login is two requests (send + verify), so this is
   * ~50 logins per 5 minutes from one public address. Comfortable for a shared
   * carrier NAT, ruinous for a credential-stuffing run.
   */
  auth: {
    max: 100,
    windowSeconds: 300,
    // RATE_LIMITED, deliberately NOT OTP_RATE_LIMITED. This policy spans every
    // auth route — admin sign-in/email as much as phone OTP — so labelling an
    // admin's password-throttle refusal "OTP rate limited" would be a lie the
    // console would then have to render. OTP_RATE_LIMITED stays reserved for the
    // per-phone send limiter (auth/otp/otp-api-error.ts), which is what mobile's
    // resend countdown is actually keyed on; keeping it specific is what makes
    // that countdown trustworthy.
    code: RATE_LIMITED,
    message: 'Too many authentication attempts. Please try again shortly.',
  },

  // ── Per-user, enforced after the session is resolved (rate-limit.guard.ts) ─

  /**
   * POST /reports. The tightest limit in the product, on purpose.
   *
   * Creating a report is not an ordinary write: it fans out a push notification
   * to every volunteer within the reporter's radius (alerts/, push/). A spam
   * report is not a wasted database row, it is a phone buzzing in a stranger's
   * pocket, and the cost of getting this wrong is people muting Uthavu — which
   * breaks the product's only delivery mechanism for real emergencies.
   *
   * 5 per 10 minutes. A person in a genuine emergency files one. Five covers
   * the honest worst case (a mis-typed report deleted and re-filed, a second
   * unrelated incident) with room to spare, and still bounds a spammer to a
   * rate a moderator can keep up with.
   */
  'report-create': {
    max: 5,
    windowSeconds: 600,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * POST /reports/:id/messages — Mission Chat.
   *
   * Sized from what a human under stress can actually type on a phone. 60 per 5
   * minutes is 12 messages a minute sustained, which is faster than anyone
   * types and slow enough that a script cannot bury a live mission thread.
   * Deliberately more generous than other writes: this is a conversation
   * happening during an emergency, and a false refusal here is the worst
   * possible moment to tell someone to slow down.
   */
  'mission-chat': {
    max: 60,
    windowSeconds: 300,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * POST /reports/:id/comments — public Community Comments.
   *
   * Public and visible to strangers, so the abuse case is flooding a thread
   * rather than exhausting a resource. 20 per 5 minutes is far more than a
   * discussion needs and far less than a flood.
   */
  comment: {
    max: 20,
    windowSeconds: 300,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * POST /support/tickets and ticket replies.
   *
   * Every row here is work for a human being on the other end, which makes the
   * moderation queue the scarce resource rather than the database. 10 an hour
   * is generous for someone genuinely stuck and stops one person filling a
   * shift's worth of queue in a minute.
   */
  'support-ticket': {
    max: 10,
    windowSeconds: 3600,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * POST /uploads — avatars and mission-completion photos.
   *
   * Had NO limit of any kind before this change, while its stricter sibling
   * POST /uploads/report-photo has had one since photo verification shipped.
   * Nothing about that route is cheap: each call writes a file to disk that
   * something must later clean up, and ADR 0008 puts that disk on the API host
   * rather than in a bucket that scales.
   *
   * 20 per 15 minutes deliberately mirrors the report-photo ceiling — same
   * class of resource, same bound — even though this route spends no
   * Rekognition money. An avatar changes rarely; mission-completion photos come
   * in small batches.
   */
  'avatar-upload': {
    max: 20,
    windowSeconds: 900,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * The default for any citizen route that mutates and has not asked for
   * something more specific — volunteering, completing, saving, flagging,
   * registering a device, editing a profile.
   *
   * 30 a minute is well above what tapping through the app produces and well
   * below what a loop produces. It is a burst valve, not a budget: routes whose
   * abuse case is cost or fan-out rather than volume get their own policy above.
   */
  write: { max: 30, windowSeconds: 60, code: RATE_LIMITED, message: TOO_FAST },

  /**
   * The default for citizen reads. Generous because mobile POLLS: there is no
   * realtime transport in this product (CLAUDE.md § App Profile: realtime =
   * none), so GET /users/me/alerts and the discovery feed are hit on a timer,
   * and Mission Chat is read by polling too. Throttling a poll loop produces
   * exactly the symptom the product cannot afford — an alert that arrives late.
   *
   * 120/min is 2 requests a second sustained per account.
   */
  read: { max: 120, windowSeconds: 60, code: RATE_LIMITED, message: TOO_FAST },

  /**
   * Mutating /admin/* routes. Applied by controller path, so every current and
   * future admin mutation is covered without a decorator anyone can forget —
   * the same reasoning MaintenanceGuard uses for detecting admin routes.
   *
   * Looser than citizen writes (60/min) because an admin is a trusted, audited
   * operator working a queue, and because every one of these actions is already
   * behind AdminGuard and written to the audit log. The limit is here to bound
   * a compromised or runaway console session, not to police a moderator.
   */
  'admin-write': {
    max: 60,
    windowSeconds: 60,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },

  /**
   * Reads under /admin/*. The console is `desktop-first` and dense — a single
   * page load fans out to several endpoints, and a moderator clicking through a
   * review queue generates bursts. 240/min keeps the tool feeling instant while
   * still bounding a scraper holding a stolen session.
   */
  'admin-read': {
    max: 240,
    windowSeconds: 60,
    code: RATE_LIMITED,
    message: TOO_FAST,
  },
};

/** `report-create` -> `RATE_LIMIT_REPORT_CREATE_MAX` / `..._WINDOW`. */
export function envVarNamesFor(policy: RateLimitPolicy): {
  max: string;
  window: string;
} {
  const stem = `RATE_LIMIT_${policy.toUpperCase().replace(/-/g, '_')}`;
  return { max: `${stem}_MAX`, window: `${stem}_WINDOW` };
}

/**
 * Reads a positive-integer env var, falling back when unset, blank or nonsense.
 *
 * Zero is rejected along with negatives and NaN. `RATE_LIMIT_READ_MAX=0` almost
 * certainly means somebody meant "unlimited" and would instead have refused
 * every read in the product — falling back to the documented default is the
 * only outcome that is never catastrophic. Turning enforcement off has one
 * spelling (RATE_LIMIT_DISABLED) and it is not a zero hidden in a limit.
 */
function envPositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export interface RateLimitConfig {
  readonly enabled: boolean;
  readonly policies: Record<RateLimitPolicy, PolicyDefinition>;
}

/**
 * Resolves the table against the environment.
 *
 * A function rather than a module-level constant for the reason
 * moderationThresholds() is: the tests need to vary the environment, and a
 * constant computed at import time cannot be varied at all.
 */
export function rateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitConfig {
  const policies = {} as Record<RateLimitPolicy, PolicyDefinition>;

  for (const policy of RATE_LIMIT_POLICIES) {
    const fallback = DEFAULTS[policy];
    const names = envVarNamesFor(policy);
    policies[policy] = {
      ...fallback,
      max: envPositiveInt(env, names.max, fallback.max),
      windowSeconds: envPositiveInt(env, names.window, fallback.windowSeconds),
    };
  }

  return {
    // Opt-OUT, checked for an explicit 'true'. Anything else — unset, blank,
    // 'false', '0', a typo — leaves enforcement on. There is no value of any
    // other variable in this file that can disable the limiter.
    enabled: env.RATE_LIMIT_DISABLED?.trim().toLowerCase() !== 'true',
    policies,
  };
}

/** Exposed for tests that need to assert against the shipped defaults. */
export const RATE_LIMIT_DEFAULTS: Readonly<
  Record<RateLimitPolicy, PolicyDefinition>
> = DEFAULTS;
