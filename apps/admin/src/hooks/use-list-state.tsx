"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import {
  applyListParams,
  clearNarrowing,
  countActiveFilters,
  isNarrowed as computeIsNarrowed,
  parseListParams,
  resolveListConfig,
  sortEquals,
  type ListConfig,
  type ListParams,
  type ListSort,
  type ResolvedListConfig,
  type SortDirection,
} from "@/lib/list-params";

/**
 * URL-backed list state, shared by the table, the filters and the pagination.
 *
 * WHY A PROVIDER AND NOT A PLAIN HOOK
 * ───────────────────────────────────────────────────────────────────────────
 * `useSearchParams()` must sit inside a `<Suspense>` boundary — without one the
 * whole route opts out of static rendering (CLAUDE.md calls this out, and Next
 * will say so at build time). A bare `useListState()` hook would put that
 * requirement on every one of the 13 pages and be forgotten on at least one of
 * them. Wrapping it here makes the boundary structural: the only way to read
 * list state is from inside a provider that already established it.
 *
 * WHY history.pushState AND NOT router.replace
 * ───────────────────────────────────────────────────────────────────────────
 * Next integrates the native History methods with its router, so `useSearchParams`
 * still sees the change (see `linking-and-navigating.md` in the bundled docs).
 * `router.replace()` would additionally re-run the server layout on every
 * debounced keystroke — a full RSC round trip to change `?q=`. The URL stays
 * shareable either way; this way typing stays local.
 *
 * pushState vs replaceState is a deliberate split. Paging PUSHES, so Back
 * returns to the previous page of results like an operator expects. Typing and
 * filtering REPLACE, so Back doesn't have to walk out through every keystroke.
 */

export type ListStateValue = {
  params: ListParams;
  config: ResolvedListConfig;

  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sort: ListSort | null) => void;
  /** asc -> desc -> back to the list's default. Cycles, never dead-ends. */
  toggleSort: (key: string) => void;
  setSearch: (value: string) => void;
  setFilter: (key: string, value: string | null) => void;
  setFilters: (values: Record<string, string | null>) => void;
  /** Cursor paging. `direction` keeps the page counter honest for the query key. */
  goToCursor: (cursor: string | null, direction: "next" | "prev") => void;
  clearAll: () => void;

  activeFilterCount: number;
  /** True when a search term or any filter is narrowing the list. */
  isNarrowed: boolean;
  /** Current direction for `key`, or null. Feeds `aria-sort`. */
  sortDirectionFor: (key: string) => SortDirection | null;
  /** True when this filter differs from its resting value. Drives the chip. */
  isFilterActive: (key: string) => boolean;
};

const ListStateContext = createContext<ListStateValue | null>(null);

export function ListStateProvider({
  config,
  fallback = null,
  children,
}: {
  /**
   * Prefer a module-level constant. Inlining an object literal still works —
   * it is compared by value, not identity — but re-creating it every render
   * costs a JSON round trip each time.
   */
  config?: ListConfig;
  /** Shown while the search params resolve. Use the table's own skeleton. */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  // Serialised so an inline `config={{ ... }}` doesn't produce a new resolved
  // config (and new setter identities) on every single render.
  const configKey = JSON.stringify(config ?? {});

  return (
    <Suspense fallback={fallback}>
      <ListStateInner configKey={configKey}>{children}</ListStateInner>
    </Suspense>
  );
}

function ListStateInner({ configKey, children }: { configKey: string; children: ReactNode }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const config = useMemo(
    () => resolveListConfig(JSON.parse(configKey) as ListConfig),
    [configKey],
  );

  const params = useMemo(() => parseListParams(searchParams, config), [searchParams, config]);

  const commit = useCallback(
    (next: ListParams, history: "push" | "replace") => {
      const query = applyListParams(searchParams, next, config).toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (history === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [searchParams, pathname, config],
  );

  /**
   * Narrowing the list invalidates the position in it. Page 4 of an unfiltered
   * table is not page 4 of the filtered one, and keeping the number would land
   * the operator on an empty page that looks like "no results" — the exact
   * false negative this layer is built to avoid. Cursors are worse: a cursor
   * issued under the old filters means nothing under the new ones.
   */
  const commitNarrowed = useCallback(
    (next: ListParams) => commit({ ...next, page: 1, cursor: null }, "replace"),
    [commit],
  );

  const setPage = useCallback(
    (page: number) => commit({ ...params, page: Math.max(1, page), cursor: null }, "push"),
    [commit, params],
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      // Row 61 at 20-per-page is on a different page at 50-per-page, so there
      // is no honest way to "stay put". Going back to the top is predictable;
      // landing somewhere arbitrary is not.
      commit({ ...params, pageSize, page: 1, cursor: null }, "replace");
    },
    [commit, params],
  );

  const setSort = useCallback(
    (sort: ListSort | null) => commit({ ...params, sort, page: 1, cursor: null }, "replace"),
    [commit, params],
  );

  const toggleSort = useCallback(
    (key: string) => {
      const current = params.sort;
      let next: ListSort | null;
      if (!current || current.key !== key) next = { key, direction: "asc" };
      else if (current.direction === "asc") next = { key, direction: "desc" };
      else next = config.defaultSort;
      commit({ ...params, sort: next, page: 1, cursor: null }, "replace");
    },
    [commit, params, config.defaultSort],
  );

  const setSearch = useCallback(
    (value: string) => commitNarrowed({ ...params, search: value }),
    [commitNarrowed, params],
  );

  const setFilter = useCallback(
    (key: string, value: string | null) => {
      const filters = { ...params.filters };
      if (value === null || value === "") delete filters[key];
      else filters[key] = value;
      commitNarrowed({ ...params, filters });
    },
    [commitNarrowed, params],
  );

  const setFilters = useCallback(
    (values: Record<string, string | null>) => {
      const filters = { ...params.filters };
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === "") delete filters[key];
        else filters[key] = value;
      }
      commitNarrowed({ ...params, filters });
    },
    [commitNarrowed, params],
  );

  const goToCursor = useCallback(
    (cursor: string | null, direction: "next" | "prev") => {
      // The page number is not displayed in cursor mode — it exists so the
      // query key changes and React Query treats this as a new page rather
      // than a refetch of the current one.
      const page = direction === "next" ? params.page + 1 : Math.max(1, params.page - 1);
      commit({ ...params, cursor, page }, "push");
    },
    [commit, params],
  );

  const clearAll = useCallback(
    () => commit(clearNarrowing(params, config), "replace"),
    [commit, params, config],
  );

  const sortDirectionFor = useCallback(
    (key: string): SortDirection | null =>
      params.sort && params.sort.key === key ? params.sort.direction : null,
    [params.sort],
  );

  const isFilterActive = useCallback(
    (key: string) => (params.filters[key] ?? "") !== (config.defaultFilters[key] ?? ""),
    [params.filters, config.defaultFilters],
  );

  const value = useMemo<ListStateValue>(
    () => ({
      params,
      config,
      setPage,
      setPageSize,
      setSort,
      toggleSort,
      setSearch,
      setFilter,
      setFilters,
      goToCursor,
      clearAll,
      activeFilterCount: countActiveFilters(params, config),
      isNarrowed: computeIsNarrowed(params, config),
      sortDirectionFor,
      isFilterActive,
    }),
    [
      params,
      config,
      setPage,
      setPageSize,
      setSort,
      toggleSort,
      setSearch,
      setFilter,
      setFilters,
      goToCursor,
      clearAll,
      sortDirectionFor,
      isFilterActive,
    ],
  );

  return <ListStateContext.Provider value={value}>{children}</ListStateContext.Provider>;
}

export function useListState(): ListStateValue {
  const value = useContext(ListStateContext);
  if (!value) {
    throw new Error(
      "useListState() must be called inside a <ListStateProvider>. The provider owns the <Suspense> boundary that useSearchParams() requires.",
    );
  }
  return value;
}

/** Present so callers can re-export it alongside the state without a second import. */
export { sortEquals };
