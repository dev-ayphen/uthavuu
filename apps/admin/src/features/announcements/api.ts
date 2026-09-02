"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { ApiError, toApiError } from "@/lib/api-error";
import { API_URL } from "@/lib/env";

/**
 * The write half of the announcements endpoints.
 *
 * ⚠ KNOWN NAMING DEBT — THE HTTP PATH IS `community-updates`, NOT A BUG
 * ───────────────────────────────────────────────────────────────────────────
 * This feature is called **Announcements** everywhere a human can see it: the
 * nav, the routes (`/announcements`), the page titles, the folder you are in.
 * The HTTP path it calls is still `/admin/community-updates`, and the table
 * behind it is still `community_updates`. That mismatch is deliberate.
 *
 * WHY THE UI WAS RENAMED. "Community Updates" already means something else in
 * this product: the PUBLIC, per-report information feed — "anyone may post here
 * and everyone can read it" — which this codebase ships as Community Comments
 * (`report_comments`) and moderates at `/reports/comments`. This section is the
 * opposite thing: admin-authored, bilingual announcements broadcast FROM the
 * console TO citizens. Two features under one name was the actual bug.
 *
 * WHY THE API AND DB WERE NOT RENAMED. Renaming them costs a migration plus a
 * rewrite of already-seeded `community_update.*` audit-action rows, and this
 * feature's long-term survival is still undecided. Not worth spending until it
 * is. If it is ever settled, rename the endpoint, the table and the audit
 * actions together — and delete this comment.
 *
 * So: a "community update" on the wire is an "announcement" on screen. The
 * record noun inherited from the API (`AdminUpdate`, `UPDATE_NOT_FOUND`,
 * `COMMUNITY_UPDATE_KEYS`, the `update-*.tsx` files) deliberately keeps the
 * wire's spelling, so wire-shaped code reads the same as the contract it
 * mirrors. Anything a user reads says "announcement".
 *
 * WHY THIS IS NOT `apiFetch`, AND NOT `adminMutate` EITHER
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`.
 * `src/features/moderation/api.ts` widened that to `"POST" | "PATCH"` for the
 * moderation pages and wrote down why. Neither can express `DELETE`, which is
 * how this contract spells "archive it out of sight for good" — so rather than
 * reach into `src/lib/` (owned elsewhere) or into another feature's file, the
 * write path lives here and keeps exactly the same contract:
 * `credentials: "include"`, an `ApiError` for every failure, and
 * `status === null` reserved for "never got a reply".
 *
 * If `RequestOptions["method"]` is ever widened to cover DELETE, this file
 * collapses into a re-export and nothing else in the feature changes.
 */

export type UpdateMutationMethod = "POST" | "PATCH" | "DELETE";

/** Every list and detail query this feature owns, for one-call invalidation. */
export const COMMUNITY_UPDATE_KEYS: QueryKey[] = [["admin", "community-updates"]];

export async function communityUpdateMutate<TResponse>(
  path: string,
  method: UpdateMutationMethod,
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
 * Publishing sets `publishAt` server-side and moves the row between status
 * filters; archiving and deleting change what the list even contains. Patching
 * the cache by hand is a second implementation of the API's rules, kept in sync
 * by hand and wrong the first time the backend adds a side effect.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`.
 */
export async function runUpdateAction<TResponse>({
  queryClient,
  path,
  method = "POST",
  body,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method?: UpdateMutationMethod;
  body?: unknown;
  success: string;
}): Promise<TResponse> {
  const result = await communityUpdateMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, COMMUNITY_UPDATE_KEYS);
  toast.success(success);
  return result;
}
