/**
 * Browser-side calls to the Uthavu API.
 *
 * Admin auth is COOKIE/SESSION based, unlike mobile's bearer tokens, so every
 * request here carries `credentials: "include"`. Without it the browser omits
 * the session cookie on a cross-origin request and the API answers 403
 * ADMIN_NO_SESSION — which looks exactly like being signed out.
 *
 * CORS is strict on purpose: the API allowlists `ADMIN_URL` (http://localhost:3002).
 * A cross-origin request with credentials also requires the API to answer with
 * `Access-Control-Allow-Credentials: true` and to echo the exact origin — a
 * wildcard is illegal with credentials. Both hold today; changing the console's
 * port breaks them.
 */

import { ApiError, toApiError } from "./api-error";
import { API_URL } from "./env";

type RequestOptions = {
  method?: "GET" | "POST";
  /** Serialised as JSON. Omitted entirely for GET. */
  body?: unknown;
  searchParams?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

/**
 * Performs the request and returns the parsed JSON body.
 *
 * Throws an `ApiError` for every failure, with `status === null` reserved for
 * "never got a reply". Callers branch on `code` / `isNetworkFailure`.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, searchParams, signal } = options;

  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // The whole point of this module.
      credentials: "include",
      // `content-type: application/json` is what makes this a preflighted
      // request, so it is only sent when there is actually a body. A bare GET
      // stays a "simple" request and skips the OPTIONS round trip.
      headers:
        body === undefined
          ? { accept: "application/json" }
          : { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    // fetch() rejects only for transport-level failure: connection refused,
    // DNS, offline, or a CORS rejection. Never for a 4xx/5xx. Keeping this
    // branch separate is what lets the login form say "couldn't reach the API"
    // instead of "wrong password".
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("The console couldn't reach the API.", { status: null });
  }

  if (!response.ok) {
    throw await toApiError(response, `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
