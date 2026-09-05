// Base HTTP client. Every request goes through the real backend contract in
// docs/API-CONTRACT.md — there is no mock/dev-mode fallback baked in here (see
// ADR 0006: msg91 from the start, no OTP stub). apps/api must exist and be running
// at EXPO_PUBLIC_API_URL for any of this to actually succeed.

import { clearToken, getToken } from './session';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// `code` matches whatever error-code scheme the endpoint uses — Better Auth's own
// PHONE_NUMBER_ERROR_CODES for auth routes (OTP_EXPIRED, INVALID_OTP, ...), our own
// DTO validation codes elsewhere.
export class ApiError extends Error {
  status: number;
  code?: string;
  /**
   * Seconds until a rate-limited call may be retried, when the API says so.
   *
   * The only structured field any endpoint returns beside `code`/`message`
   * (`UPLOAD_RATE_LIMITED` on POST /uploads/report-photo). It's kept because
   * dropping it forces the screen to invent a wait — "try again later" when the
   * server already knows it's 42 seconds. Optional everywhere else, so no
   * caller has to care.
   */
  retryAfterSeconds?: number;

  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RequestOptions = {
  // PUT is here for exactly one endpoint — `PUT /reports/:id/photos`, the
  // reporter's reply to "send us a different photo" (libs-mobile/api/reports.ts).
  // It is a full replace of a held report's photo set, which is the one write in
  // this app that is genuinely idempotent rather than additive, so PATCH would
  // have been the wrong verb and reusing POST would have made it look like
  // `POST /reports/:id/photos`, which ADDS one photo to a live report.
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
};

// apps/mobile owns navigation — this file can't import RootStackParamList or
// a navigation ref directly (wrong dependency direction, libs-mobile has no
// concept of the app's screen tree). The app registers a callback once at
// startup instead (see RootNavigator.tsx); apiRequest calls it on a real
// session-expiry 401, this file never has to know what "Login" even is.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

/** The API's code for a suspended account (apps/api account-status guard). */
export const ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED';

// Registered the same way as the handler above, for the same reason. Kept
// SEPARATE from it on purpose: a suspended account is not an expired session.
// Routing it through the 401 path would clear the token and drop the user on
// Login, where they would sign in successfully — the API deliberately does not
// revoke the session — and then be blocked again on the next screen with no
// explanation. See docs/decisions/0011.
let suspendedHandler: ((message: string) => void) | null = null;

export function setSuspendedHandler(fn: (message: string) => void): void {
  suspendedHandler = fn;
}

/**
 * The API's codes for a platform-wide write freeze, set by an admin on the
 * console's Platform tab and read by mobile via GET /config (see
 * libs-mobile/api/config.ts). Citizen writes come back 403 with one of these
 * while the freeze is on.
 */
export const MAINTENANCE_MODE = 'MAINTENANCE_MODE';
export const READ_ONLY_MODE = 'READ_ONLY_MODE';

export type PlatformBlockCode = typeof MAINTENANCE_MODE | typeof READ_ONLY_MODE;

// Third handler, registered the same way, kept separate from BOTH of the
// others on purpose. Not the 401 path: the session is perfectly valid, so
// clearing the token and bouncing to Login would be a lie that also costs the
// user their place in whatever they were doing. Not the suspension path
// either: nothing is wrong with this account, the platform is simply frozen,
// so the user stays exactly where they are and can keep reading. All this does
// is replace a generic "something went wrong" with the honest reason.
let platformBlockedHandler: ((code: PlatformBlockCode) => void) | null = null;

export function setPlatformBlockedHandler(fn: (code: PlatformBlockCode) => void): void {
  platformBlockedHandler = fn;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(0, 'EXPO_PUBLIC_API_URL is not set — see apps/mobile/.env.example');
  }

  // A FormData body (file upload) must NOT get a manual Content-Type — fetch
  // sets its own multipart boundary. JSON is the default for everything else.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (options.auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: isFormData
        ? (options.body as FormData)
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
      // Auth is bearer-token-only on mobile (see auth.ts's bearer() plugin
      // comment) — no cookie jar by design. React Native's fetch otherwise
      // auto-stores and resends any Set-Cookie from Better Auth's session
      // creation via the OS's shared cookie store, which then trips Better
      // Auth's origin-check middleware (it only requires an Origin header when
      // a Cookie header is present) — and native fetch never sends Origin, so
      // that request gets rejected with "Missing or null Origin". Omitting
      // credentials here stops the cookie from ever being stored at all.
      credentials: 'omit',
    });
  } catch {
    // fetch rejects (rather than resolving with a bad status) when the request
    // never completed a round trip: API not running, wrong host/port, phone off
    // the LAN, connection dropped mid-upload. Callers used to see this as a bare
    // TypeError and fall back to a generic message, which made a dead server and
    // a rejected file indistinguishable — status 0 marks it as "never reached
    // the server" so they can say so.
    throw new ApiError(
      0,
      `Could not reach the server at ${BASE_URL}. Check that the API is running and the device is on the same network.`,
      'NETWORK_UNREACHABLE'
    );
  }

  if (res.status === 202 || res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // A 401 only means "your session is dead" when this request actually
    // sent a bearer token in the first place. `send-otp`/`verify` are
    // `auth: false` — a 401 there means "wrong OTP", not "expired session",
    // and must NOT clear a token or bounce the user off the login flow.
    if (res.status === 401 && options.auth) {
      await clearToken();
      unauthorizedHandler?.();
    }

    // A suspended account fails EVERY authenticated call, so without this the
    // user meets a generic "something went wrong" on whatever screen they
    // happened to open, and no amount of retrying or re-logging-in changes it.
    // The API returns 403 + this code precisely so the client can say what is
    // actually happening.
    if (res.status === 403 && data?.code === ACCOUNT_SUSPENDED && options.auth) {
      suspendedHandler?.(data?.message ?? 'This account has been suspended.');
    }

    // Deliberately not gated on options.auth, unlike the two above: a bare 401
    // is ambiguous (wrong OTP vs. dead session) and a suspension only makes
    // sense for a signed-in account, but these codes mean exactly one thing
    // wherever they appear. The throw below still happens, so the calling
    // screen keeps its own inline error state — this only adds the explanation.
    if (res.status === 403 && (data?.code === MAINTENANCE_MODE || data?.code === READ_ONLY_MODE)) {
      platformBlockedHandler?.(data.code as PlatformBlockCode);
    }
    throw new ApiError(
      res.status,
      data?.message ?? `Request failed (${res.status})`,
      data?.code,
      // Guarded rather than passed through: a non-numeric value here would
      // reach a screen as "try again in [object Object] seconds".
      typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined
    );
  }

  return data as T;
}
