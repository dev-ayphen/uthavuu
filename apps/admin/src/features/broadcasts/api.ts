"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { ApiError, toApiError } from "@/lib/api-error";
import { API_URL } from "@/lib/env";

/**
 * The write half of `/admin/broadcasts`.
 *
 * WHY NOT `apiFetch`, AND NOT `adminMutate` EITHER
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`;
 * `features/moderation/api.ts` widened that to `"POST" | "PATCH"` and wrote
 * down why. Neither can express DELETE, which is how this contract spells
 * "throw the draft away". Rather than reach into `src/lib/` (owned elsewhere)
 * or into another feature's file, the write path lives here and keeps exactly
 * the same contract: `credentials: "include"`, an `ApiError` for every failure,
 * and `status === null` reserved for "never got a reply".
 *
 * `features/announcements/api.ts` made the same call for the same reason. The
 * duplication is deliberate and small; if `RequestOptions["method"]` is ever
 * widened, both files collapse into a re-export.
 */

export type BroadcastMutationMethod = "POST" | "PATCH" | "DELETE";

/**
 * Every query this feature owns, for one-call invalidation.
 *
 * One prefix covers both the list (`["admin","broadcasts", …params]`) and the
 * detail (`["admin","broadcasts","detail",id]`), because React Query matches
 * keys by prefix. That matters more here than usual: a send changes the row's
 * status, its `sentAt` and BOTH counts, and a detail page showing "Draft" next
 * to a list already showing "Sent" is the state that gets an operator pressing
 * Send a second time.
 */
export const BROADCAST_KEYS: QueryKey[] = [["admin", "broadcasts"]];

export async function broadcastMutate<TResponse>(
  path: string,
  method: BroadcastMutationMethod,
  body?: unknown,
): Promise<TResponse> {
  // DELETE carries no body — the API takes its optional `reason` as a QUERY
  // parameter precisely so a body is never required (see
  // `DeleteBroadcastQuerySchema`). Sending `{}` with a JSON content-type would
  // make it a preflighted request for no reason, and some proxies drop a
  // DELETE body outright.
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

  // DELETE answers 204. Parsing an empty body as JSON throws while handling the
  // success path.
  if (response.status === 204) return undefined as TResponse;
  return (await response.json()) as TResponse;
}

/** `/admin/broadcasts/:id`, with the id encoded exactly once. */
export function broadcastPath(broadcastId: string, suffix = ""): string {
  return `/admin/broadcasts/${encodeURIComponent(broadcastId)}${suffix}`;
}

/**
 * `DELETE /admin/broadcasts/:id?reason=…`.
 *
 * The reason is a QUERY parameter and it is OPTIONAL, which is unusual in this
 * console and is the API's deliberate design (ADR 0012, and the note on
 * `DeleteBroadcastQuerySchema`). ADR 0012 wants a reason on destructive
 * actions; Announcements' `DELETE` takes none because its contract was frozen
 * without a body, recorded there as "a deviation, not a precedent". This
 * endpoint is the narrow fix: a client sending nothing still works, and one
 * that has a reason can record it in the audit trail.
 *
 * So the console collects it — optionally — rather than throwing the
 * affordance away. It is worth noting why the weaker guarantee is defensible
 * here specifically: DELETE is refused on anything past `draft`, so the only
 * rows it can touch are broadcasts that reached nobody. The destructive act on
 * this table is `send`, and that one is audited unconditionally.
 */
export function deleteBroadcast(broadcastId: string, reason?: string): Promise<void> {
  const trimmed = reason?.trim();
  const suffix = trimmed ? `?reason=${encodeURIComponent(trimmed)}` : "";
  return broadcastMutate<void>(broadcastPath(broadcastId, suffix), "DELETE");
}

/**
 * Fire an action, then make the screen agree with the database.
 *
 * Mirrors `runModerationAction` and `runUpdateAction`, INCLUDING their choice
 * not to be optimistic — and the case is stronger here than in either. A send
 * moves the status, stamps `sentAt` and writes two counts the console cannot
 * predict; an optimistic "Sent" that the API then refuses with
 * `BROADCAST_ALREADY_SENT` would tell an operator that fifty thousand phones
 * had buzzed when nothing happened. Refetching is one round trip and cannot
 * drift.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`.
 * `success` may be a function so the send toast can quote the reach the API
 * actually reported rather than a number the console guessed.
 */
export async function runBroadcastAction<TResponse>({
  queryClient,
  path,
  method = "POST",
  body,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method?: BroadcastMutationMethod;
  body?: unknown;
  success: string | ((result: TResponse) => string);
}): Promise<TResponse> {
  const result = await broadcastMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, BROADCAST_KEYS);
  toast.success(typeof success === "function" ? success(result) : success);
  return result;
}
