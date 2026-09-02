"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { ApiError, toApiError } from "@/lib/api-error";
import { API_URL } from "@/lib/env";

/**
 * The write half of `/admin/admins` and `/admin/me/change-password`.
 *
 * WHY THIS IS NOT `apiFetch`, AND NOT ANOTHER FEATURE'S MUTATOR
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`.
 * `features/moderation/api.ts` widened that to `"POST" | "PATCH"`;
 * `features/announcements/api.ts` and `features/report-categories/api.ts` each
 * needed `DELETE` and each wrote the same paragraph explaining why they did not
 * reach into `src/lib/` (a shared surface, owned elsewhere) or into a sibling
 * feature's file. This section needs PATCH **and** DELETE, so it is now the
 * fourth copy — which is the clearest possible signal that the right home is a
 * widened `RequestOptions["method"]` in `src/lib/api-client.ts`, at which point
 * all four files collapse into a re-export. Flagged rather than done, because
 * `src/lib/` is not this task's surface.
 *
 * The contract is identical to the other three: `credentials: "include"`, an
 * `ApiError` for every failure, and `status === null` reserved for "never got a
 * reply".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PASSWORDS
 * ─────────────────────────────────────────────────────────────────────────────
 * Two of the endpoints this module calls carry a plaintext password in the
 * request body. Four rules hold everywhere in this feature, and this file is
 * where three of them are enforced:
 *
 *   1. A password is only ever a POST BODY. Never a query string — `apiFetch`'s
 *      `searchParams` path is not reachable from here at all, and the URL is
 *      what lands in a proxy log, a browser history entry and a Referer header.
 *   2. Nothing is logged. There is no `console.*` in this feature, and the
 *      `catch` below deliberately discards the thrown cause rather than
 *      re-wrapping it, because a rejected `fetch` can carry the request in its
 *      cause chain on some runtimes.
 *   3. No password touches React Query. `runAdminAccountAction` exists for the
 *      state-changing routes and none of the password routes use it — they call
 *      `adminAccountMutate` directly, so a credential can never be handed to
 *      something that caches, serialises or devtools-inspects it.
 *   4. No password appears in a toast. See the call sites: the success message
 *      names the person, never the secret.
 */

export type AdminAccountMutationMethod = "POST" | "PATCH" | "DELETE";

/** Every query this feature owns, for one-call invalidation. */
export const ADMIN_ACCOUNT_KEYS: QueryKey[] = [["admin", "admins"]];

export async function adminAccountMutate<TResponse>(
  path: string,
  method: AdminAccountMutationMethod,
  body?: unknown,
): Promise<TResponse> {
  // DELETE carries no body: the contract declares none, sending `{}` with a
  // JSON content-type would make it a preflighted request for no reason, and
  // some proxies drop a DELETE body outright — so nothing should ever depend on
  // one arriving.
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
    // Rule 2. The cause is dropped on purpose — see the header note.
    throw new ApiError("The console couldn't reach the API.", { status: null });
  }

  if (!response.ok) {
    throw await toApiError(response, `Request failed with status ${response.status}.`);
  }

  // 204 is the declared answer for reset-password, change-password and revoke.
  // Parsing an empty body as JSON would throw while handling the SUCCESS path.
  if (response.status === 204) return undefined as TResponse;
  return (await response.json()) as TResponse;
}

/**
 * Fire an admin-account action, then make the screen agree with the database.
 *
 * NOT OPTIMISTIC, for the same reason `runModerationAction` isn't. Suspending
 * an admin moves their row in the list AND their detail record; revoking access
 * removes them from both. Hand-patching each is a second implementation of the
 * API's rules, kept in sync by hand and wrong the first time the backend adds a
 * side effect. And a row that flashes "Suspended" before snapping back is worse,
 * in a console whose whole job is to be believed about who can sign in, than a
 * row that waits one round trip.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`.
 * A field problem is neither: it belongs on the field.
 *
 * NOT USED BY THE TWO PASSWORD ROUTES. See rule 3 in the header note.
 */
export async function runAdminAccountAction<TResponse>({
  queryClient,
  path,
  method = "POST",
  body,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method?: AdminAccountMutationMethod;
  body?: unknown;
  success: string;
}): Promise<TResponse> {
  const result = await adminAccountMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, ADMIN_ACCOUNT_KEYS);
  toast.success(success);
  return result;
}
