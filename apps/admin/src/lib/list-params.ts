/**
 * List state <-> URL query string. Pure functions, no React, no fetching.
 *
 * WHY THE URL IS THE STORE
 * ───────────────────────────────────────────────────────────────────────────
 * A moderator who filters Reports to "flagged, last 24h, unassigned" and pastes
 * the link into a ticket must hand over the same view they were looking at.
 * Keeping that state in `useState` makes the link a lie and loses the view on
 * reload. So the query string is the single source of truth and React state is
 * derived from it — never the other way round.
 *
 * THREE RULES HOLD THIS TOGETHER
 *
 *  1. DEFAULTS ARE NEVER WRITTEN. `/users` and `/users?page=1&size=25` are the
 *     same view, so only deviations appear in the URL. Without this every link
 *     is noise and "is this filtered?" stops being answerable by looking.
 *  2. EVERYTHING IS CLAMPED ON THE WAY IN. The query string is user input — it
 *     arrives from a hand-edited address bar as readily as from a click.
 *     `?size=100000` must not become a request for every row in the table.
 *  3. THE URL SHAPE AND THE API SHAPE ARE ALLOWED TO DIFFER. The console writes
 *     one compact `sort=createdAt:desc`; the API (admin-pagination.ts, and the
 *     per-endpoint DTOs) wants `sort=createdAt&order=desc` and calls page size
 *     `limit`. Translating in one place beats leaking the API's spelling into
 *     every shareable link.
 */

export type SortDirection = "asc" | "desc";

export type ListSort = { key: string; direction: SortDirection };

/** How this list spells its params in the ADDRESS BAR. */
export type ListParamNames = {
  page: string;
  pageSize: string;
  sort: string;
  search: string;
  cursor: string;
};

export const DEFAULT_LIST_PARAM_NAMES: ListParamNames = {
  page: "page",
  pageSize: "size",
  sort: "sort",
  search: "q",
  cursor: "cursor",
};

/**
 * How this list spells its params when talking to the API.
 *
 * Defaults are the real Uthavu admin contract, verified against
 * `apps/api/src/admin/admin-pagination.ts` and the `dto/list-*.dto.ts` schemas:
 * `page`, `limit`, free text `q`, and sort split across `sort` + `order`.
 */
export type ListApiParamNames = {
  page: string;
  pageSize: string;
  sort: string;
  order: string;
  search: string;
  cursor: string;
};

export const DEFAULT_LIST_API_PARAM_NAMES: ListApiParamNames = {
  page: "page",
  pageSize: "limit",
  sort: "sort",
  order: "order",
  search: "q",
  cursor: "cursor",
};

/**
 * `split`  -> `sort=createdAt&order=desc`  (what this API wants)
 * `combined` -> `sort=createdAt:desc`      (for an endpoint that takes one param)
 */
export type SortStyle = "split" | "combined";

/**
 * Matches `PaginationSchema.limit`, which defaults to 25 and is capped at 100.
 * Offering a size the API rejects turns a dropdown into a 400.
 */
export const DEFAULT_PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;

/** Hard cap from the API's own schema. Anything above is a guaranteed 400. */
export const MAX_PAGE_SIZE = 100;

/**
 * An operator cannot reach page 10,000 by clicking, so a page number past this
 * arrived by hand. Clamping keeps a typo from becoming an OFFSET the database
 * has to count through.
 */
const MAX_PAGE = 10_000;

export type ListConfig = {
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
  defaultSort?: ListSort | null;
  /**
   * Which query params this list treats as filters. An allowlist, not a
   * catch-all: without it every unrelated param on the URL (a `?ref=` from an
   * email, a sibling widget's `?tab=`) would be forwarded to the API as a
   * filter, and "clear all" would wipe params this list does not own.
   */
  filterKeys?: readonly string[];
  /**
   * Resting value per filter. Two jobs, both load-bearing:
   *
   *   - Kept OUT of the URL, so the resting view has a clean address.
   *   - Excluded from the "is this narrowed?" count, so a list showing its
   *     default slice still says "No tickets yet" rather than "nothing matched
   *     your filters".
   *
   * Set these to match the API's own DTO defaults (e.g. users' `audience`
   * defaults to `citizen`, comments' `includeRemoved` to `false`). Where they
   * agree, omitting the param and sending it are the same request.
   */
  defaultFilters?: Record<string, string>;
  paramNames?: Partial<ListParamNames>;
  apiParamNames?: Partial<ListApiParamNames>;
  sortStyle?: SortStyle;
  /**
   * Prefix for every param this list owns, so two lists can coexist on one
   * page without fighting over `page`. Affects the URL only, never the API.
   */
  namespace?: string;
};

export type ResolvedListConfig = {
  defaultPageSize: number;
  pageSizeOptions: readonly number[];
  defaultSort: ListSort | null;
  filterKeys: readonly string[];
  defaultFilters: Record<string, string>;
  paramNames: ListParamNames;
  apiParamNames: ListApiParamNames;
  sortStyle: SortStyle;
  namespace: string;
};

export function resolveListConfig(config: ListConfig = {}): ResolvedListConfig {
  const options = (
    config.pageSizeOptions && config.pageSizeOptions.length > 0
      ? config.pageSizeOptions
      : DEFAULT_PAGE_SIZE_OPTIONS
  ).filter((size) => size > 0 && size <= MAX_PAGE_SIZE);

  const pageSizeOptions = options.length > 0 ? options : DEFAULT_PAGE_SIZE_OPTIONS;

  // The default must be selectable, or the size <select> renders with no option
  // matching its own value and silently shows the wrong one.
  const requested = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const defaultPageSize = pageSizeOptions.includes(requested)
    ? requested
    : (pageSizeOptions[0] ?? DEFAULT_PAGE_SIZE);

  const filterKeys = config.filterKeys ?? [];
  const declaredDefaults = config.defaultFilters ?? {};

  // Only defaults for filters this list actually owns. A default on an
  // unlisted key would be sent to the API but never rendered or clearable.
  const defaultFilters: Record<string, string> = {};
  for (const key of filterKeys) {
    const value = declaredDefaults[key];
    if (value !== undefined && value !== "") defaultFilters[key] = value;
  }

  return {
    defaultPageSize,
    pageSizeOptions,
    defaultSort: config.defaultSort ?? null,
    filterKeys,
    defaultFilters,
    paramNames: { ...DEFAULT_LIST_PARAM_NAMES, ...config.paramNames },
    apiParamNames: { ...DEFAULT_LIST_API_PARAM_NAMES, ...config.apiParamNames },
    sortStyle: config.sortStyle ?? "split",
    namespace: config.namespace ?? "",
  };
}

export type ListParams = {
  page: number;
  pageSize: number;
  sort: ListSort | null;
  search: string;
  /** Always fully populated: URL values folded over the configured defaults. */
  filters: Record<string, string>;
  /** Set only when the API is cursor-paginated. Ignored by offset endpoints. */
  cursor: string | null;
};

/** Structural: satisfied by both `URLSearchParams` and `ReadonlyURLSearchParams`. */
export type SearchParamsLike = { get(name: string): string | null };

function qualify(name: string, namespace: string): string {
  return namespace ? `${namespace}_${name}` : name;
}

export function parseListParams(source: SearchParamsLike, config: ResolvedListConfig): ListParams {
  const named = (key: keyof ListParamNames) => qualify(config.paramNames[key], config.namespace);

  // Start from the defaults so `params.filters` is always the complete picture
  // of what will be requested — callers never have to remember to merge.
  const filters: Record<string, string> = { ...config.defaultFilters };
  for (const key of config.filterKeys) {
    const value = source.get(qualify(key, config.namespace));
    if (value === null) continue;
    if (value === "") delete filters[key];
    else filters[key] = value;
  }

  return {
    page: readPage(source.get(named("page"))),
    pageSize: readPageSize(source.get(named("pageSize")), config),
    sort: readSort(source.get(named("sort"))) ?? config.defaultSort,
    search: (source.get(named("search")) ?? "").trim(),
    filters,
    cursor: source.get(named("cursor")) || null,
  };
}

function readPage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

/**
 * Fails to the default rather than to the requested number. An arbitrary page
 * size is a denial-of-service knob pointed at our own API — which is exactly
 * why `PaginationSchema` caps `limit` at 100 — so only the sizes the UI offers
 * are honoured.
 */
function readPageSize(raw: string | null, config: ResolvedListConfig): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return config.defaultPageSize;
  return config.pageSizeOptions.includes(parsed) ? parsed : config.defaultPageSize;
}

/** `"createdAt:desc"` -> `{ key: "createdAt", direction: "desc" }`. */
export function readSort(raw: string | null): ListSort | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf(":");
  if (separator <= 0) return null;

  const key = raw.slice(0, separator);
  const direction = raw.slice(separator + 1);
  if (!key) return null;
  if (direction !== "asc" && direction !== "desc") return null;

  return { key, direction };
}

export function writeSort(sort: ListSort | null): string | null {
  return sort ? `${sort.key}:${sort.direction}` : null;
}

export function sortEquals(a: ListSort | null, b: ListSort | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.key === b.key && a.direction === b.direction;
}

/**
 * Fold `params` into a copy of the URL's existing query string.
 *
 * Copies rather than replaces so params this list does not own survive — a
 * sibling widget's state, an inbound campaign tag. Values equal to a default
 * are DELETED, not written, so the URL only ever shows what differs from rest.
 */
export function applyListParams(
  current: SearchParamsLike & { toString(): string },
  params: ListParams,
  config: ResolvedListConfig,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  const named = (key: keyof ListParamNames) => qualify(config.paramNames[key], config.namespace);

  set(next, named("page"), params.page > 1 ? String(params.page) : null);
  set(
    next,
    named("pageSize"),
    params.pageSize === config.defaultPageSize ? null : String(params.pageSize),
  );
  set(
    next,
    named("sort"),
    sortEquals(params.sort, config.defaultSort) ? null : writeSort(params.sort),
  );
  set(next, named("search"), params.search.trim() || null);
  set(next, named("cursor"), params.cursor);

  for (const key of config.filterKeys) {
    const value = params.filters[key] ?? "";
    const fallback = config.defaultFilters[key] ?? "";

    if (value === fallback) {
      // At rest: keep it out of the URL entirely.
      set(next, qualify(key, config.namespace), null);
    } else if (value === "" && fallback !== "") {
      // Explicitly cleared a filter that has a non-empty default. The empty
      // string has to be written, because deleting the param would re-apply
      // the default on the next read and the filter would spring back on.
      next.set(qualify(key, config.namespace), "");
    } else {
      set(next, qualify(key, config.namespace), value);
    }
  }

  return next;
}

function set(target: URLSearchParams, key: string, value: string | null): void {
  if (value === null || value === "") target.delete(key);
  else target.set(key, value);
}

/** Filters differing from their resting value. Drives the "Clear all" affordance. */
export function countActiveFilters(params: ListParams, config: ResolvedListConfig): number {
  let count = 0;
  for (const key of config.filterKeys) {
    const value = params.filters[key] ?? "";
    if (value !== (config.defaultFilters[key] ?? "")) count += 1;
  }
  return count;
}

/**
 * Has the operator narrowed the list?
 *
 * This is what separates "No users yet" from "No users match these filters",
 * and getting it wrong tells someone their data is missing when it is merely
 * filtered out. A filter sitting at its default does NOT count as narrowing.
 */
export function isNarrowed(params: ListParams, config: ResolvedListConfig): boolean {
  return params.search.trim() !== "" || countActiveFilters(params, config) > 0;
}

/**
 * Reset every narrowing control to rest, while keeping how the operator likes
 * to READ the table. Sort and page size are display preferences, not filters —
 * wiping them on "clear all" would be a surprise.
 */
export function clearNarrowing(params: ListParams, config: ResolvedListConfig): ListParams {
  return {
    ...params,
    page: 1,
    cursor: null,
    search: "",
    filters: { ...config.defaultFilters },
  };
}

/**
 * The params the API is asked for, as flat strings.
 *
 * Deliberately NOT namespaced: the namespace exists to stop two lists on one
 * page colliding in the address bar, and forwarding it would ask the API for a
 * param called `secondary_page` that it has never heard of.
 */
export function listParamsToQuery(
  params: ListParams,
  config: ResolvedListConfig,
): Record<string, string> {
  const names = config.apiParamNames;
  const query: Record<string, string> = {
    [names.page]: String(params.page),
    [names.pageSize]: String(params.pageSize),
  };

  if (params.sort) {
    if (config.sortStyle === "split") {
      query[names.sort] = params.sort.key;
      query[names.order] = params.sort.direction;
    } else {
      query[names.sort] = `${params.sort.key}:${params.sort.direction}`;
    }
  }

  if (params.search.trim()) query[names.search] = params.search.trim();
  if (params.cursor) query[names.cursor] = params.cursor;

  // Filters go through under their own names — they ARE the API's names.
  for (const [key, value] of Object.entries(params.filters)) {
    if (value !== "") query[key] = value;
  }

  return query;
}

/** Zero-based index of the first row on this page. */
export function pageOffset(params: ListParams): number {
  return (params.page - 1) * params.pageSize;
}
