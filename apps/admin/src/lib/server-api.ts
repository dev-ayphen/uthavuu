import "server-only";

import { cookies } from "next/headers";

import { ApiError, toApiError } from "./api-error";
import { API_URL } from "./env";

/**
 * Server-side calls to the Uthavu API, on behalf of the signed-in admin.
 *
 * Distinct from ./api-client, which runs in the browser and relies on
 * `credentials: "include"` to attach the session cookie automatically. A
 * server component has no ambient cookie jar — nothing is "included" — so the
 * incoming request's cookies must be read and forwarded by hand. Miss that and
 * the API answers 403 ADMIN_NO_SESSION, which is indistinguishable from being
 * signed out and sends the operator into a redirect loop.
 *
 * Dev quirk worth knowing: cookies ignore port, so the cookie better-auth sets
 * from localhost:3001 is present on localhost:3002 requests too. In production
 * across genuinely different domains that stops being true, and the console and
 * API must share a registrable domain (or the cookie needs an explicit Domain
 * attribute) for this forwarding to have anything to forward.
 */
export async function serverApiFetch<T>(
  path: string,
  options: { searchParams?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }

  const cookieHeader = (await cookies()).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: cookieHeader
        ? { accept: "application/json", cookie: cookieHeader }
        : { accept: "application/json" },
      // Session-scoped data. A cached admin dashboard would serve one admin's
      // view to the next, and a cached 403 would outlive the sign-in that fixed it.
      cache: "no-store",
    });
  } catch {
    // Transport failure only — never a 4xx/5xx. Kept separate so callers can
    // tell "the API refused you" from "the API is down"; the guard treats those
    // very differently (see getAdminSession).
    throw new ApiError("The console couldn't reach the API.", { status: null });
  }

  if (!response.ok) {
    throw await toApiError(response, `Request failed with status ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
