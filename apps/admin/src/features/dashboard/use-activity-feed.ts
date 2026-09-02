"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { shouldRetryListError } from "@/hooks/use-list-query";
import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { classifyListFailure, type ListFailure } from "@/lib/list-failure";
import { readActivityPage, type ActivityItem, type ActivityPage } from "./activity-types";

/**
 * The live activity feed, from `GET /admin/activity?limit&cursor`.
 *
 * THE ONLY PLACE THIS FEATURE TOUCHES THE NETWORK
 * ───────────────────────────────────────────────────────────────────────────
 * At the time of writing the endpoint answers 404 — the backend half is being
 * built in parallel. Nothing about that is encoded anywhere except one branch
 * below, which turns a 404 into the calm "not live yet" view instead of a red
 * error. When the endpoint ships, the branch simply stops being reached: no
 * edit, no flag, no redeploy of the panel.
 *
 * BRANCH ORDER IS ENFORCED BY THE TYPE, NOT BY A COMMENT
 * ───────────────────────────────────────────────────────────────────────────
 * Same reasoning as `useListQuery`: independent `isLoading`/`isError`/`length`
 * booleans make it possible to render "No activity yet" over a failed request,
 * which tells an operator the community went quiet when in fact the API went
 * down. One discriminated union resolved here in the right order — loading →
 * unavailable → failure → empty → ready — makes that unrepresentable.
 */

const PAGE_SIZE = 20;

export type ActivityView =
  | { kind: "loading" }
  /** The endpoint isn't deployed. Not a fault to report — a gap to state. */
  | { kind: "unavailable" }
  | { kind: "failure"; failure: ListFailure }
  /** The API answered, with nothing in it. Genuinely nothing has happened. */
  | { kind: "empty" }
  | { kind: "ready"; items: ActivityItem[] };

/**
 * False when the caller lacks `platform:manage`, so `admin.action` rows are
 * legitimately absent from the stream. Read off the newest page: it is a fact
 * about the session, not about the page.
 */
export type ActivityScope = { includesAdminActions: boolean };

export type UseActivityFeedResult = {
  view: ActivityView;
  scope: ActivityScope;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** A request is in flight, including a background refresh behind live rows. */
  isFetching: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
};

async function fetchActivityPage(
  cursor: string | null,
  signal: AbortSignal,
): Promise<ActivityPage> {
  const raw = await apiFetch<unknown>("/admin/activity", {
    searchParams: { limit: String(PAGE_SIZE), cursor: cursor ?? undefined },
    signal,
  });
  return readActivityPage(raw);
}

export function useActivityFeed(): UseActivityFeedResult {
  const query = useInfiniteQuery({
    queryKey: ["admin", "activity", PAGE_SIZE],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchActivityPage(pageParam, signal),
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const next = lastPage.nextCursor;
      if (!next) return undefined;
      // A cursor that does not move is an API bug, and the shape it takes in the
      // UI is a "Load more" button that spins forever re-fetching the same
      // twenty rows. Stopping is the honest response: the operator sees the end
      // of the list rather than an endless one.
      if (next === lastPageParam) return undefined;
      return next;
    },
    // Narrower than the app-wide `retry: 1`. Re-sending a request that was
    // correctly refused (403), that hit a route the API does not serve (404),
    // or that carried a cursor the API rejected (400 ACTIVITY_INVALID_CURSOR)
    // just fails the same way, a round trip later.
    retry: shouldRetryListError,
    staleTime: 15_000,
  });

  const { status, error, data } = query;

  const view = useMemo<ActivityView>(() => {
    if (status === "pending") return { kind: "loading" };

    if (status === "error") {
      // 404 is not "something went wrong", it is "this half isn't built yet".
      // A red alert here would send an operator to file a bug against work that
      // is simply still in flight.
      if (error instanceof ApiError && error.status === 404) return { kind: "unavailable" };
      return { kind: "failure", failure: classifyListFailure(error) };
    }

    const items = data?.pages.flatMap((page) => page.items) ?? [];
    if (items.length === 0) return { kind: "empty" };
    return { kind: "ready", items };
  }, [status, error, data]);

  return {
    view,
    scope: { includesAdminActions: data?.pages[0]?.includesAdminActions !== false },
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetching: query.isFetching,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
  };
}
