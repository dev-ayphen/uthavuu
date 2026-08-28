"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminMutate, type MutationMethod } from "./api";

/**
 * Fire a moderation action, then make the screen agree with the database.
 *
 * WHY INVALIDATE RATHER THAN PATCH THE CACHE
 * ───────────────────────────────────────────────────────────────────────────
 * One action moves several things at once. Suspending a user changes their row
 * in the list AND their detail record AND (once the audit page exists) the log.
 * Closing a report changes its effective status, its `closedAt`, and — because
 * `AdminReportModerationService.close()` alerts every active volunteer — the
 * mission roster underneath it. Hand-patching each of those is a second
 * implementation of the API's own rules, kept in sync by hand and wrong the
 * first time the backend adds a side effect. Refetching is one round trip and
 * cannot drift.
 *
 * These are not optimistic. An optimistic close that the API then refuses with
 * REPORT_ALREADY_COMPLETED would flash "closed" at a moderator before snapping
 * back, and in a console whose whole job is to be believed about state, a
 * status that lies for 200ms is worse than one that waits.
 */
export async function runModerationAction<TResponse>({
  queryClient,
  path,
  method = "POST",
  body,
  invalidate,
  success,
}: {
  queryClient: QueryClient;
  path: string;
  method?: MutationMethod;
  body?: unknown;
  /** Query-key prefixes to refetch. `["admin","reports"]` covers list + detail. */
  invalidate: QueryKey[];
  /** Toast on success. A completed ACTION is a toast; a failed LOAD is not. */
  success: string;
}): Promise<TResponse> {
  const result = await adminMutate<TResponse>(path, method, body);
  await invalidateAll(queryClient, invalidate);
  toast.success(success);
  return result;
}

/**
 * Refetch the given key prefixes.
 *
 * Also the right response to a stale-conflict refusal ("already closed"): the
 * action did not happen, but the row on screen was wrong, and leaving it wrong
 * is how an operator tries the same thing twice.
 */
export async function invalidateAll(
  queryClient: QueryClient,
  keys: QueryKey[],
): Promise<void> {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
