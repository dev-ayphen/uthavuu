"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { invalidateAll } from "@/features/moderation/actions";
import { adminMutate } from "@/features/moderation/api";

/**
 * The write half of the support-ticket endpoints.
 *
 * WHY THIS REUSES `adminMutate` RATHER THAN ADDING A THIRD CLIENT
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/api-client.ts` types its `method` as `"GET" | "POST"`.
 * `features/moderation/api.ts` widened that to `"POST" | "PATCH"` and wrote
 * down why; `features/announcements/api.ts` widened it again to reach `DELETE`.
 * This contract needs POST and PATCH and nothing else — exactly what
 * `adminMutate` already is — so it is imported rather than copied. A third
 * near-identical fetch wrapper would be the point at which "each feature owns
 * its writes" stops being a convention and becomes drift.
 *
 * `src/lib/` is owned elsewhere, which is why nothing here widens it. If
 * `RequestOptions["method"]` is ever broadened, both feature clients collapse
 * into re-exports and nothing else changes.
 *
 * NOT OPTIMISTIC — AND ON THIS SECTION THAT IS A RULE, NOT A PREFERENCE
 * ───────────────────────────────────────────────────────────────────────────
 * Status is server-owned. Resolving may set `resolved_at`; closing sets
 * `closed_at` AND disables the composer; assigning may be refused if the target
 * is no longer an admin. Patching the cache by hand is a second implementation
 * of the API's rules, kept in sync by hand and wrong the first time the backend
 * adds a side effect. Worse, a status that flashes "Closed" and snaps back is,
 * in a console whose whole job is to be believed about state, more damaging
 * than one that waits a round trip.
 *
 * So every mutation here refetches and renders whatever the server says —
 * never a transition this console predicted.
 */

/** Every list and detail query this feature owns, for one-call invalidation. */
export const SUPPORT_TICKET_KEYS: QueryKey[] = [["admin", "support-tickets"]];

/**
 * Fire an action, then make the screen agree with the database.
 *
 * A completed ACTION is a toast. A failed LOAD is not — that is `ErrorState`
 * with a retry. A field problem is neither: it belongs on the field.
 */
export async function runTicketAction<TResponse>({
  queryClient,
  path,
  method = "POST",
  body,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method?: "POST" | "PATCH";
  body?: unknown;
  /** Toast on success. Pass `null` where the result is visible on screen. */
  success: string | null;
}): Promise<TResponse> {
  const result = await adminMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, SUPPORT_TICKET_KEYS);
  if (success) toast.success(success);
  return result;
}

/** `/admin/support-tickets/:id`, with the id encoded exactly once. */
export function ticketPath(ticketId: string, suffix = ""): string {
  return `/admin/support-tickets/${encodeURIComponent(ticketId)}${suffix}`;
}
