/**
 * The seam between "whatever the API returns" and "what a table can render".
 *
 * The endpoints these 13 pages consume are being written right now, so this
 * layer deliberately commits to NOTHING about the response envelope. A page
 * supplies a fetcher and an adapter; the adapter is the only code that knows
 * whether rows arrive at `items`, `data`, or the top level. When the real shape
 * lands, one adapter changes and every table keeps working.
 *
 * OFFSET VS CURSOR IS NOT A DETAIL
 * ───────────────────────────────────────────────────────────────────────────
 * An offset API can say "137 results, page 3 of 7". A cursor API cannot — it
 * knows only that another page exists. `total: null` is how that ignorance is
 * carried through the system, and `Pagination` is required to respect it: no
 * invented total, no page numbers that cannot be reached. Defaulting `total` to
 * `rows.length` instead of `null` would make a cursor API silently claim "20 of
 * 20" on every page, which is worse than saying nothing.
 */

export type ListPageMode = "offset" | "cursor";

export type ListPage<TRow> = {
  rows: TRow[];
  mode: ListPageMode;
  /** Total rows across all pages, or `null` when the API cannot say. */
  total: number | null;
  /** Total pages, or `null` when unknowable. Page numbers render only if set. */
  pageCount: number | null;
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
};

export type ListAdapterContext = {
  page: number;
  pageSize: number;
};

export type ListAdapter<TRaw, TRow> = (raw: TRaw, context: ListAdapterContext) => ListPage<TRow>;

/**
 * Thrown when the response cannot be read as a list.
 *
 * Deliberately an error and not an empty page: a shape mismatch rendered as
 * "No users yet" tells an operator their data is gone when the response was
 * merely unexpected. Better a visible, explicable failure with a retry.
 */
export class ListShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListShapeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Keys an array of rows has been seen to arrive under. */
const ROW_KEYS = ["items", "data", "results", "rows", "records", "list"] as const;
/** Nested objects that commonly carry the counts. */
const META_KEYS = ["pagination", "meta", "page", "pageInfo", "_meta"] as const;

const TOTAL_KEYS = ["total", "totalCount", "totalItems", "count", "totalRecords"] as const;
const PAGE_COUNT_KEYS = ["pageCount", "totalPages", "pages", "lastPage"] as const;
const NEXT_CURSOR_KEYS = ["nextCursor", "next_cursor", "endCursor", "next", "after"] as const;
const PREV_CURSOR_KEYS = ["prevCursor", "prev_cursor", "startCursor", "previous", "before"] as const;

/** Look for `key` on the envelope, then inside any of the usual meta objects. */
function findValue(envelope: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (envelope[key] !== undefined && envelope[key] !== null) return envelope[key];
  }
  for (const metaKey of META_KEYS) {
    const meta = envelope[metaKey];
    if (!isRecord(meta)) continue;
    for (const key of keys) {
      if (meta[key] !== undefined && meta[key] !== null) return meta[key];
    }
  }
  return undefined;
}

function findRows(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return null;

  for (const key of ROW_KEYS) {
    const candidate = raw[key];
    if (Array.isArray(candidate)) return candidate;
  }

  // `{ data: { items: [...] } }` — an enveloped envelope, which is exactly the
  // shape docs/API-CONTRACT.md sketches. One level of unwrapping, not a
  // recursive hunt: deeper than this and we are guessing, not adapting.
  for (const key of ROW_KEYS) {
    const nested = raw[key];
    if (!isRecord(nested)) continue;
    for (const innerKey of ROW_KEYS) {
      const candidate = nested[innerKey];
      if (Array.isArray(candidate)) return candidate;
    }
  }

  return null;
}

/** Where the counts live for a `{ data: { items, pagination } }` response. */
function findEnvelope(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  for (const key of ROW_KEYS) {
    const nested = raw[key];
    if (isRecord(nested) && !Array.isArray(nested)) {
      // Merge so counts found at either level are visible to `findValue`.
      return { ...raw, ...nested };
    }
  }
  return raw;
}

function buildPage<TRow>(
  rows: TRow[],
  envelope: Record<string, unknown>,
  context: ListAdapterContext,
  forcedMode?: ListPageMode,
): ListPage<TRow> {
  const nextCursor = readString(findValue(envelope, NEXT_CURSOR_KEYS));
  const prevCursor = readString(findValue(envelope, PREV_CURSOR_KEYS));

  const total = readNumber(findValue(envelope, TOTAL_KEYS));
  const declaredPageCount = readNumber(findValue(envelope, PAGE_COUNT_KEYS));

  const mode: ListPageMode = forcedMode ?? (nextCursor !== null && total === null ? "cursor" : "offset");

  // Floor at 0, NOT at 1. `paginate()` in admin-pagination.ts returns
  // `totalPages: 0` for an empty table on purpose — "Page 1 of 0" is true,
  // while "Page 1 of 1" implies there is a page worth looking at.
  const pageCount =
    declaredPageCount !== null
      ? Math.max(0, Math.trunc(declaredPageCount))
      : total !== null && context.pageSize > 0
        ? Math.ceil(total / context.pageSize)
        : null;

  return {
    rows,
    mode,
    total: total === null ? null : Math.max(0, Math.trunc(total)),
    pageCount,
    nextCursor,
    prevCursor,
    hasNext: computeHasNext({ mode, nextCursor, pageCount, rows, context }),
    hasPrev: mode === "cursor" ? prevCursor !== null || context.page > 1 : context.page > 1,
  };
}

/**
 * "Is there another page?"
 *
 * With a page count this is arithmetic. Without one it is the single inference
 * this module allows itself: a page returned FULL probably has more behind it,
 * a short page definitely does not. That is sound — a full page is evidence —
 * and the worst case is one wasted request landing on an empty page, which the
 * empty state handles. Note what is NOT inferred: a total. Guessing "how many"
 * from "there is more" is the invention this file exists to prevent.
 */
function computeHasNext<TRow>(input: {
  mode: ListPageMode;
  nextCursor: string | null;
  pageCount: number | null;
  rows: TRow[];
  context: ListAdapterContext;
}): boolean {
  if (input.mode === "cursor") return input.nextCursor !== null;
  if (input.pageCount !== null) return input.context.page < input.pageCount;
  return input.rows.length >= input.context.pageSize && input.rows.length > 0;
}

/**
 * The default. Reads array, cursor and offset envelopes without being told
 * which one it got, so a page can be written before its endpoint exists.
 *
 * Pin a specific adapter below once the real shape is known — this one is a
 * bridge, not a destination. It cannot distinguish a missing `total` from an
 * API that has none, so it reports `total: null` for both, and a page that
 * could have shown "of 137" would quietly stop doing so.
 */
export function detectListAdapter<TRow>(): ListAdapter<unknown, TRow> {
  return (raw, context) => {
    // A bare array is the whole result set, not page 1 of an unknown number.
    // `GET /admin/report-categories` returns one because it is a small lookup
    // table the API deliberately leaves unpaginated — so the total is genuinely
    // known here, and reporting `null` would needlessly hide "12 categories".
    if (Array.isArray(raw)) return completeSet(raw as TRow[]);

    const rows = findRows(raw);
    if (rows === null) {
      throw new ListShapeError(
        "The API's response didn't look like a list. Expected an array, or an object with an `items`/`data`/`results` array.",
      );
    }
    return buildPage(rows as TRow[], findEnvelope(raw), context);
  };
}

/** An unpaginated response: everything there is, on one page. */
function completeSet<TRow>(rows: TRow[]): ListPage<TRow> {
  return {
    rows,
    mode: "offset",
    total: rows.length,
    pageCount: rows.length === 0 ? 0 : 1,
    nextCursor: null,
    prevCursor: null,
    hasNext: false,
    hasPrev: false,
  };
}

/** The response IS the array — no envelope, no counts. `GET /admin/admins` today. */
export function arrayListAdapter<TRow>(): ListAdapter<TRow[], TRow> {
  // No `context`: a bare array ignores paging entirely.
  return (raw) => {
    if (!Array.isArray(raw)) {
      throw new ListShapeError("Expected the API to return an array of rows.");
    }
    return completeSet(raw);
  };
}

/** Page/size pagination with a total: `{ items, total }`, `{ data, pagination }`, … */
export function offsetListAdapter<TRow>(): ListAdapter<unknown, TRow> {
  return (raw, context) => {
    const rows = findRows(raw);
    if (rows === null) throw new ListShapeError("Expected a paginated list response.");
    return buildPage(rows as TRow[], findEnvelope(raw), context, "offset");
  };
}

/** Cursor pagination: rows plus a `nextCursor`, and honestly no total. */
export function cursorListAdapter<TRow>(): ListAdapter<unknown, TRow> {
  return (raw, context) => {
    const rows = findRows(raw);
    if (rows === null) throw new ListShapeError("Expected a cursor-paginated list response.");
    const page = buildPage(rows as TRow[], findEnvelope(raw), context, "cursor");
    // A cursor API has no total even if something total-shaped was found; page
    // numbers computed from it would point at pages no cursor can reach.
    return { ...page, total: null, pageCount: null };
  };
}

/**
 * Escape hatch for a response this module should not be taught to guess at.
 * Map it by hand and keep the guessing out of the shared layer.
 */
export function customListAdapter<TRaw, TRow>(
  map: (raw: TRaw, context: ListAdapterContext) => ListPage<TRow>,
): ListAdapter<TRaw, TRow> {
  return map;
}

/** The row range this page covers, 1-based and inclusive. Empty page -> null. */
export function pageRange(
  page: ListPage<unknown>,
  context: ListAdapterContext,
): { from: number; to: number } | null {
  if (page.rows.length === 0) return null;
  // In cursor mode the offset is unknowable — you cannot count rows you skipped
  // past without ever seeing. Callers render "20 results" instead of a range.
  if (page.mode === "cursor") return null;
  const from = (context.page - 1) * context.pageSize + 1;
  return { from, to: from + page.rows.length - 1 };
}
