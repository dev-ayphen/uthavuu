"use client";

import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { ApiError } from "@/lib/api-error";
import { classifyListFailure, type ListFailure } from "@/lib/list-failure";
import {
  detectListAdapter,
  ListShapeError,
  type ListAdapter,
  type ListPage,
} from "@/lib/list-page";
import { listParamsToQuery, pageOffset, type ListParams, type ListSort } from "@/lib/list-params";
import { useListState } from "./use-list-state";

/**
 * The one hook a list page calls. URL state in, a renderable view out.
 *
 * BRANCH ORDER IS ENFORCED BY THE TYPE, NOT BY A COMMENT
 * ───────────────────────────────────────────────────────────────────────────
 * The rule is loading -> error -> empty -> content, and the classic way to
 * break it is a page that reads `data?.length === 0` before it reads `isError`,
 * so a failed request renders "No reports yet". An operator reads that as
 * "the data is gone" and escalates.
 *
 * Independent booleans make that mistake available. A single discriminated
 * union does not: there is exactly one `view.kind` at a time, resolved here in
 * the correct order, and a page that handles `"empty"` has already been handed
 * a value that is *not* a failure. The ordering bug becomes unrepresentable
 * rather than merely discouraged.
 *
 * WHY PREVIOUS DATA IS KEPT
 * ───────────────────────────────────────────────────────────────────────────
 * `placeholderData: keepPreviousData` means clicking to page 3 keeps page 2's
 * rows on screen until page 3 arrives, instead of collapsing to a skeleton and
 * back. The table stops flashing, the scroll position stops jumping, and the
 * pagination controls stay where the operator's cursor already is. The trade is
 * that on-screen rows can briefly be one page stale — hence `isPlaceholder`,
 * which callers use to dim the table so "stale" is visible rather than implied.
 */

export type ListFetchArgs = {
  page: number;
  pageSize: number;
  /** Zero-based index of the first row. For `LIMIT/OFFSET` style endpoints. */
  offset: number;
  sort: ListSort | null;
  search: string;
  filters: Record<string, string>;
  cursor: string | null;
  /**
   * The whole lot, flattened to query params using this list's configured
   * names. The common case is one line:
   *   `(args) => apiFetch("/admin/users", { searchParams: args.searchParams, signal: args.signal })`
   */
  searchParams: Record<string, string>;
  /** Passed straight to `apiFetch` so React Query can abort a superseded page. */
  signal: AbortSignal;
};

export type ListFetcher<TRaw> = (args: ListFetchArgs) => Promise<TRaw>;

export type ListView<TRow> =
  | { kind: "loading" }
  | { kind: "failure"; failure: ListFailure; retry: () => void }
  /** Zero rows. `narrowed` separates "nothing yet" from "nothing matched". */
  | { kind: "empty"; narrowed: boolean; clearAll: () => void }
  | { kind: "ready"; page: ListPage<TRow>; rows: TRow[] };

export type UseListQueryOptions<TRaw, TRow> = {
  /** Query key root, e.g. `["admin", "users"]`. Params are appended. */
  key: QueryKey;
  fetcher: ListFetcher<TRaw>;
  /**
   * Defaults to `detectListAdapter()`, which reads array / offset / cursor
   * envelopes without being told which. Pin a real adapter once the endpoint's
   * shape is settled — the detector cannot tell a missing total from an API
   * that has none, so it reports "no total" for both.
   */
  adapter?: ListAdapter<TRaw, TRow>;
  enabled?: boolean;
  staleTime?: number;
  /**
   * Override the retry policy. The default (see `shouldRetryListError`) is
   * deliberately narrower than the app-wide `retry: 1`.
   */
  retry?: number | boolean | ((failureCount: number, error: Error) => boolean);
  /**
   * A mid-session 403 ADMIN_NO_SESSION means the session expired, and the only
   * useful response is to sign in again. `/login` sits outside the (console)
   * group so this cannot loop. Turn it off for a list rendered somewhere a
   * redirect would lose unsaved work.
   */
  redirectOnSignedOut?: boolean;
};

export type UseListQueryResult<TRow> = {
  view: ListView<TRow>;
  /** Normalised page, or null before the first successful load. */
  page: ListPage<TRow> | null;
  rows: TRow[];
  params: ListParams;
  /** A request is in flight — including a background refetch behind live rows. */
  isFetching: boolean;
  /** On-screen rows belong to the PREVIOUS page while this one loads. */
  isPlaceholder: boolean;
  refetch: () => void;
  /** Exposed so a mutation can invalidate exactly this list. */
  queryKey: QueryKey;
};

/**
 * Which list failures are worth asking about twice.
 *
 * The app-wide default is `retry: 1`, which is right for a flaky network and
 * wrong for a refusal. Re-sending a request that returned 403
 * ADMIN_MISSING_PERMISSION gets refused again by definition; all the retry buys
 * is a second wasted round trip and — the part that shows — roughly a second of
 * skeleton before the operator is told they lack permission. A permission
 * message that arrives late reads as a slow page, not as an answer.
 *
 * So: retry transport failures and 5xx (genuinely transient), plus 429 once the
 * backoff has passed. Never retry a 4xx refusal or a response we simply could
 * not parse — those are deterministic, and the second attempt is theatre.
 */
export function shouldRetryListError(failureCount: number, error: Error): boolean {
  if (error instanceof ListShapeError) return false;

  if (error instanceof ApiError) {
    // Never reached the API: worth one more go.
    if (error.isNetworkFailure) return failureCount < 1;
    if (error.status === 429) return failureCount < 1;
    if (error.status !== null && error.status < 500) return false;
  }

  return failureCount < 1;
}

export function useListQuery<TRaw, TRow>({
  key,
  fetcher,
  adapter,
  enabled = true,
  staleTime,
  // Aliased: `retry` inside this hook is the view's "try again" callback.
  retry: retryPolicy = shouldRetryListError,
  redirectOnSignedOut = true,
}: UseListQueryOptions<TRaw, TRow>): UseListQueryResult<TRow> {
  const { params, config, clearAll, isNarrowed } = useListState();
  const router = useRouter();

  const resolvedAdapter = useMemo(
    () => adapter ?? (detectListAdapter<TRow>() as unknown as ListAdapter<TRaw, TRow>),
    [adapter],
  );

  const queryKey = useMemo<QueryKey>(
    () => [
      ...(Array.isArray(key) ? key : [key]),
      {
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        search: params.search,
        filters: params.filters,
        cursor: params.cursor,
      },
    ],
    [key, params],
  );

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const raw = await fetcher({
        page: params.page,
        pageSize: params.pageSize,
        offset: pageOffset(params),
        sort: params.sort,
        search: params.search,
        filters: params.filters,
        cursor: params.cursor,
        searchParams: listParamsToQuery(params, config),
        signal,
      });
      // Adapting inside the queryFn means a shape mismatch is an error with a
      // retry, not a silently empty table. What lands in the cache is already
      // normalised, so nothing downstream re-derives it.
      return resolvedAdapter(raw, { page: params.page, pageSize: params.pageSize });
    },
    enabled,
    staleTime,
    retry: retryPolicy,
    placeholderData: keepPreviousData,
  });

  // Destructured so the memo/callback dependency lists below name the exact
  // values they read, rather than the whole (newly-identified-every-render)
  // query object.
  const { isPending, isError, error, isFetching, isPlaceholderData, refetch } = query;

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const failure = useMemo<ListFailure | null>(
    () => (isError ? classifyListFailure(error) : null),
    [isError, error],
  );

  useEffect(() => {
    if (redirectOnSignedOut && failure?.kind === "signed-out") {
      router.replace("/login");
    }
  }, [redirectOnSignedOut, failure?.kind, router]);

  const page = query.data ?? null;
  const rows = page?.rows ?? [];

  const view = useMemo<ListView<TRow>>(() => {
    // The order below IS the rule. Do not reorder.
    if (isPending) return { kind: "loading" };
    if (failure) return { kind: "failure", failure, retry };
    if (!page) return { kind: "loading" };
    if (page.rows.length === 0) return { kind: "empty", narrowed: isNarrowed, clearAll };
    return { kind: "ready", page, rows: page.rows };
  }, [isPending, retry, failure, page, isNarrowed, clearAll]);

  return {
    view,
    page,
    rows,
    params,
    isFetching,
    isPlaceholder: isPlaceholderData,
    refetch: retry,
    queryKey,
  };
}
