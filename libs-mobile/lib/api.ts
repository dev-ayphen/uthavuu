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

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: isFormData ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
    // Auth is bearer-token-only on mobile (see auth.ts's bearer() plugin comment) —
    // no cookie jar by design. React Native's fetch otherwise auto-stores and
    // resends any Set-Cookie from Better Auth's session creation via the OS's
    // shared cookie store, which then trips Better Auth's origin-check middleware
    // (it only requires an Origin header when a Cookie header is present) — and
    // native fetch never sends Origin, so that request gets rejected with
    // "Missing or null Origin". Omitting credentials here stops the cookie from
    // ever being stored in the first place.
    credentials: 'omit',
  });

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
    throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`, data?.code);
  }

  return data as T;
}
