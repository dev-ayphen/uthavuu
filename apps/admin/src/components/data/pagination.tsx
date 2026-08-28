"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";

import { Button, Select } from "@/components/ui";
import { useListState } from "@/hooks/use-list-state";
import { cn } from "@/lib/cn";
import type { ListPage } from "@/lib/list-page";

/**
 * Paging controls that never claim to know more than the API told them.
 *
 * THE HONESTY RULE
 * ───────────────────────────────────────────────────────────────────────────
 * Uthavu's admin endpoints are offset-paginated and DO return a total
 * (`admin-pagination.ts`), so the full "21–40 of 137, page 3 of 7" is available
 * today. This component is still written to work without it, because the moment
 * one endpoint moves to keyset paging — the usual answer when a table gets
 * genuinely large — a component that assumed a total starts inventing one.
 *
 * What that means concretely when `total` is null:
 *   - no "of 137", because we do not know 137;
 *   - no numbered page buttons, because a button labelled "7" that no cursor
 *     can reach is a control that lies about being a control;
 *   - Next is driven by an actual `nextCursor`, not by arithmetic.
 *
 * Degrading to Prev/Next is not a worse component. Rendering seven page numbers
 * over a cursor API is.
 */

export type PaginationProps = {
  page: number;
  pageSize: number;
  /** Rows on THIS page. Used for a truthful range when the total is unknown. */
  rowCount: number;
  total: number | null;
  pageCount: number | null;
  mode: "offset" | "cursor";
  hasNext: boolean;
  hasPrev: boolean;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Cursor mode only. Offset mode uses `onPageChange`. */
  onCursorChange?: (cursor: string | null, direction: "next" | "prev") => void;
  nextCursor?: string | null;
  prevCursor?: string | null;
  isFetching?: boolean;
  className?: string;
};

export function Pagination({
  page,
  pageSize,
  rowCount,
  total,
  pageCount,
  mode,
  hasNext,
  hasPrev,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  onCursorChange,
  nextCursor = null,
  prevCursor = null,
  isFetching = false,
  className,
}: PaginationProps) {
  const sizeSelectId = useId();
  const showNumbers = mode === "offset" && pageCount !== null && pageCount > 0;

  const goPrev = () => {
    if (mode === "cursor") onCursorChange?.(prevCursor, "prev");
    else onPageChange(page - 1);
  };
  const goNext = () => {
    if (mode === "cursor") onCursorChange?.(nextCursor, "next");
    else onPageChange(page + 1);
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={sizeSelectId} className="micro-label whitespace-nowrap">
          Rows
        </label>
        <Select
          id={sizeSelectId}
          size="sm"
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="w-auto tabular"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      {/* Announced on change: a keyboard user paging with Enter otherwise gets
          no feedback that anything happened. */}
      <p aria-live="polite" className="tabular order-last w-full text-xs text-fg-subtle sm:order-none sm:w-auto">
        {describeRange({ page, pageSize, rowCount, total, mode })}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={goPrev}
          disabled={!hasPrev || isFetching}
          aria-label="Previous page"
        >
          <ChevronLeft />
          Prev
        </Button>

        {showNumbers && pageCount !== null ? (
          <ol className="mx-1 hidden items-center gap-1 md:flex">
            {pageWindow(page, pageCount).map((entry, index) =>
              entry === "gap" ? (
                <li
                  key={`gap-${index}`}
                  aria-hidden
                  className="px-1 text-xs text-fg-faint select-none"
                >
                  …
                </li>
              ) : (
                <li key={entry}>
                  <Button
                    variant={entry === page ? "soft" : "ghost"}
                    size="sm"
                    className="tabular min-w-8 px-2"
                    aria-label={`Page ${entry}`}
                    aria-current={entry === page ? "page" : undefined}
                    onClick={() => onPageChange(entry)}
                    disabled={isFetching}
                  >
                    {entry}
                  </Button>
                </li>
              ),
            )}
          </ol>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          onClick={goNext}
          disabled={!hasNext || isFetching}
          aria-label="Next page"
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

/**
 * The range sentence, degraded in three steps as knowledge runs out.
 * Every branch says only what is actually known.
 */
function describeRange({
  page,
  pageSize,
  rowCount,
  total,
  mode,
}: {
  page: number;
  pageSize: number;
  rowCount: number;
  total: number | null;
  mode: "offset" | "cursor";
}): string {
  if (rowCount === 0) return total === null ? "No rows" : `No rows · ${format(total)} total`;

  // Cursor paging cannot say WHERE in the set you are: you skipped past those
  // rows by following an opaque cursor, never by counting them.
  if (mode === "cursor") {
    return `${format(rowCount)} ${rowCount === 1 ? "row" : "rows"} on this page`;
  }

  const from = (page - 1) * pageSize + 1;
  const to = from + rowCount - 1;

  if (total === null) return `Showing ${format(from)}–${format(to)}`;
  return `${format(from)}–${format(to)} of ${format(total)}`;
}

function format(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

/**
 * First, last, and the current page's neighbours; gaps elsewhere.
 * Keeps the control a fixed width whether there are 3 pages or 300.
 */
export function pageWindow(current: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return range(1, pageCount);

  const entries: Array<number | "gap"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pageCount - 1, current + 1);

  if (start > 2) entries.push("gap");
  entries.push(...range(start, end));
  if (end < pageCount - 1) entries.push("gap");
  entries.push(pageCount);

  return entries;
}

function range(from: number, to: number): number[] {
  if (to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/**
 * The wired-up version: reads paging state from `ListStateProvider` so a page
 * only has to hand over the page it just rendered.
 */
export function ListPagination({
  page,
  isFetching,
  className,
}: {
  page: ListPage<unknown> | null;
  isFetching?: boolean;
  className?: string;
}) {
  const { params, config, setPage, setPageSize, goToCursor } = useListState();
  if (!page) return null;

  return (
    <Pagination
      page={params.page}
      pageSize={params.pageSize}
      rowCount={page.rows.length}
      total={page.total}
      pageCount={page.pageCount}
      mode={page.mode}
      hasNext={page.hasNext}
      hasPrev={page.hasPrev}
      nextCursor={page.nextCursor}
      prevCursor={page.prevCursor}
      pageSizeOptions={config.pageSizeOptions}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      onCursorChange={goToCursor}
      isFetching={isFetching}
      className={className}
    />
  );
}
