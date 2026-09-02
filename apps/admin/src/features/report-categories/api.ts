"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { ApiError, toApiError } from "@/lib/api-error";
import { API_URL } from "@/lib/env";

/**
 * The write half of `/admin/report-categories`.
 *
 * WHY THIS IS NOT `apiFetch`, AND NOT `adminMutate` EITHER
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`.
 * `src/features/moderation/api.ts` widened that to `"POST" | "PATCH"` for the
 * moderation pages. Neither can express `DELETE`, which is how this contract
 * spells "remove a category that nothing has ever used" — so rather than reach
 * into `src/lib/` (shared surface, owned elsewhere) or into another feature's
 * file, the write path lives here and keeps exactly the same contract:
 * `credentials: "include"`, an `ApiError` for every failure, and
 * `status === null` reserved for "never got a reply".
 *
 * `features/announcements/api.ts` made the same call for the same reason and
 * says so. That is now two copies, which means the right home is a widened
 * `RequestOptions["method"]` in `src/lib/api-client.ts` — at which point both
 * files collapse into a re-export and nothing else in either feature changes.
 * Flagged rather than done, because `src/lib/` is not this task's surface.
 *
 * ONE DIFFERENCE FROM ANNOUNCEMENTS, AND IT IS DELIBERATE: this API's DELETE
 * answers **200 with a body** (`{ id, deleted: true }`), not 204. The 204
 * branch below is kept anyway — it costs one comparison and it is what stops a
 * future no-content response from throwing while parsing the success path.
 */

export type CategoryMutationMethod = "POST" | "PATCH" | "DELETE";

/** Every query this feature owns, for one-call invalidation. */
export const REPORT_CATEGORY_KEYS: QueryKey[] = [["admin", "report-categories"]];

export async function categoryMutate<TResponse>(
  path: string,
  method: CategoryMutationMethod,
  body?: unknown,
): Promise<TResponse> {
  // DELETE carries no body. The controller declares no `@Body()` on it, and
  // sending `{}` with a JSON content-type would make it a preflighted request
  // for no reason — some proxies drop a DELETE body outright, so nothing should
  // ever depend on one arriving.
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

  if (response.status === 204) return undefined as TResponse;
  return (await response.json()) as TResponse;
}

/**
 * Fire a category write, then make the screen agree with the database.
 *
 * NOT OPTIMISTIC, for the same reason `runModerationAction` isn't. A category
 * edit is read live by `ReportsService` on every incoming report, so this table
 * is the console's claim about what the mobile app is doing right now. A row
 * that flashes its new label and snaps back is worse, in a console whose whole
 * job is to be believed about state, than one that waits a round trip.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`,
 * and a field problem is neither: it belongs on the field.
 */
export async function runCategoryAction<TResponse>({
  queryClient,
  path,
  method,
  body,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method: CategoryMutationMethod;
  body?: unknown;
  success: string;
}): Promise<TResponse> {
  const result = await categoryMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, REPORT_CATEGORY_KEYS);
  toast.success(success);
  return result;
}
