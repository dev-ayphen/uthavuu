"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { ApiError, toApiError } from "@/lib/api-error";
import { API_URL } from "@/lib/env";

/**
 * The write half of the sponsors endpoints.
 *
 * WHY THIS IS NOT `apiFetch`, AND NOT `adminMutate` EITHER
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`.
 * `src/features/moderation/api.ts` widened that to `"POST" | "PATCH"` for the
 * moderation pages and wrote down why. Neither can express `DELETE`, which is
 * how this contract spells "take the campaign down for good" — so rather than
 * reach into `src/lib/` (owned elsewhere) or into another feature's file, the
 * write path lives here and keeps exactly the same contract:
 * `credentials: "include"`, an `ApiError` for every failure, and
 * `status === null` reserved for "never got a reply".
 *
 * If `RequestOptions["method"]` is ever widened to cover DELETE, this file
 * collapses into a re-export and nothing else in the feature changes.
 */

export type SponsorMutationMethod = "POST" | "PATCH" | "DELETE";

/** Every list and detail query this feature owns, for one-call invalidation. */
export const SPONSOR_KEYS: QueryKey[] = [["admin", "sponsors"]];

export async function sponsorMutate<TResponse>(
  path: string,
  method: SponsorMutationMethod,
  body?: unknown,
): Promise<TResponse> {
  // DELETE carries no body. Sending `{}` with a JSON content-type would make it
  // a preflighted request for no reason, and some proxies drop a DELETE body
  // outright — better to never depend on one arriving.
  const hasBody = method !== "DELETE" && body !== undefined;

  let response: Response;
  try {
    response = await fetch(new URL(path, API_URL), {
      method,
      // Admin auth is cookie/session based. Without this the browser omits the
      // session cookie cross-origin and the API answers 403 ADMIN_NO_SESSION,
      // which is indistinguishable from being signed out.
      credentials: "include",
      headers: hasBody
        ? { accept: "application/json", "content-type": "application/json" }
        : { accept: "application/json" },
      body: hasBody ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("The console couldn't reach the API.", { status: null });
  }

  if (!response.ok) {
    throw await toApiError(response, `Request failed with status ${response.status}.`);
  }

  // DELETE answers 204, and so does any endpoint with nothing to say. Parsing
  // an empty body as JSON throws while handling the success path.
  if (response.status === 204) return undefined as TResponse;
  return (await response.json()) as TResponse;
}

/**
 * Fire an action, then make the screen agree with the database.
 *
 * Mirrors `runModerationAction` — including its choice NOT to be optimistic.
 * That choice is sharper here than anywhere else in the console, because a
 * sponsor's status is only PARTLY stored: `apps/api/src/sponsors/sponsor-status.ts`
 * derives `scheduled` and `expired` from the campaign window at read time, so
 * pausing a sponsor whose start date is next week returns `paused`, while
 * activating that same sponsor returns `scheduled` rather than `active`.
 * An optimistic patch would have to re-implement that derivation in the
 * browser — the second implementation of a rule the backend file explicitly
 * says must have exactly one. Refetching is one round trip and cannot drift.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`.
 */
export async function runSponsorAction<TResponse>({
  queryClient,
  path,
  method = "POST",
  body,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method?: SponsorMutationMethod;
  body?: unknown;
  success: string;
}): Promise<TResponse> {
  const result = await sponsorMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, SPONSOR_KEYS);
  toast.success(success);
  return result;
}
