"use client";

import { ApiError, toApiError } from "@/lib/api-error";
import { API_URL } from "@/lib/env";

/**
 * The write half of the admin API, for the four moderation pages.
 *
 * WHY THIS IS NOT `apiFetch`
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`. Every report,
 * user and comment action is a POST and goes through it happily — but resolving
 * a comment flag is `PATCH /admin/flagged-comments/:id`, which that union
 * cannot express. `src/lib/` is finished and owned elsewhere, so rather than
 * widen it from here, the write path lives in this feature and keeps the same
 * contract: `credentials: "include"`, an `ApiError` for every failure, and
 * `status === null` reserved for "never got a reply".
 *
 * If `RequestOptions["method"]` is ever widened to include PATCH, this file
 * collapses into a re-export of `apiFetch` and nothing else changes.
 */

export type MutationMethod = "POST" | "PATCH";

export async function adminMutate<TResponse>(
  path: string,
  method: MutationMethod,
  body?: unknown,
): Promise<TResponse> {
  let response: Response;

  try {
    response = await fetch(new URL(path, API_URL), {
      method,
      // Admin auth is cookie/session based. Without this the browser omits the
      // session cookie cross-origin and the API answers 403 ADMIN_NO_SESSION,
      // which is indistinguishable from being signed out.
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      // Every one of these endpoints takes a JSON body (usually `{ reason }`),
      // so unlike a bare GET there is no "simple request" fast path to protect.
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("The console couldn't reach the API.", { status: null });
  }

  if (!response.ok) {
    throw await toApiError(response, `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) return undefined as TResponse;
  return (await response.json()) as TResponse;
}
