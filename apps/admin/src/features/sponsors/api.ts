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
 * What to tell the operator once the action came back 2xx.
 *
 * WHY A TONE, WHEN THE REQUEST SUCCEEDED
 * ───────────────────────────────────────────────────────────────────────────
 * "The API accepted it" and "the thing the operator wanted has happened" are
 * not the same sentence, and on this feature they come apart for real. Verified
 * against the running API on 2026-09-02: activating a campaign whose end date
 * has already passed answers `201 Created`, and the record comes back with the
 * derived status `expired` — stored active, on nobody's screen. The console
 * used to answer that with a green "Campaign activated." An operator has then
 * been TOLD the advertisement is running, by the only feedback the action gives
 * them, while no citizen can see it. That is the exact silent failure this
 * whole feature is built to end, arriving through the success path.
 *
 * So the toast is derived from the RECORD THE API RETURNED, never from what
 * was asked for. `warning` means the write landed and the goal did not.
 */
export type SponsorActionOutcome = {
  message: string;
  /** Second line. Sonner styles it through the shared `description` class. */
  description?: string;
  /** `warning` = it saved, but not into the state the operator was after. */
  tone?: "success" | "warning";
};

/**
 * A fixed sentence, or one computed from the response.
 *
 * The function form is the ONLY way to stay honest here without re-deriving the
 * status rule in the browser — it reads the `status` the server already
 * computed in SQL against its own clock, which is what `sponsor-status.ts`
 * insists must have exactly one implementation.
 */
export type SponsorActionReport<TResponse> =
  | string
  | ((result: TResponse) => SponsorActionOutcome);

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
 * That same derivation is why the toast can disagree with the request: see
 * `SponsorActionOutcome` above, and `activationOutcome` in ./sponsor-actions.tsx.
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
  success: SponsorActionReport<TResponse>;
}): Promise<TResponse> {
  const result = await sponsorMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, SPONSOR_KEYS);

  const outcome: SponsorActionOutcome =
    typeof success === "string" ? { message: success } : success(result);

  // Sonner renders a type-specific icon for each, which is what separates the
  // two at a glance — the shared `toastOptions.classNames` in `providers.tsx`
  // pins every toast to the same surface, so the wording carries the rest.
  if (outcome.tone === "warning") {
    toast.warning(outcome.message, { description: outcome.description });
  } else {
    toast.success(outcome.message, { description: outcome.description });
  }

  return result;
}
