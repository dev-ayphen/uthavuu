"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import { Skeleton } from "@/components/ui";
import { useHorizontalOverflow } from "@/hooks/use-horizontal-overflow";
import type { ListView } from "@/hooks/use-list-query";
import { cn } from "@/lib/cn";
import type { ListSort, SortDirection } from "@/lib/list-params";
import { ListEmptyState, ListFailureState, type ListEmptyCopy } from "./list-feedback";

/**
 * The console's one table.
 *
 * HORIZONTAL SCROLL IS CONTAINED, NOT DELEGATED
 * ───────────────────────────────────────────────────────────────────────────
 * A wide table scrolls INSIDE its own `overflow-x-auto` box. If it were allowed
 * to widen the page instead, the fixed sidebar and header — which are anchored
 * to the viewport, not to the document — would stay put while everything else
 * slid under them, and the layout would visibly come apart. Two things keep the
 * overflow contained:
 *
 *   `min-w-0` on the scroll box. A grid/flex item's default `min-width: auto`
 *   refuses to shrink below its content, so without this the box grows to fit
 *   the table and pushes the page wide — the horizontal twin of the missing
 *   `min-h-0` that CLAUDE.md warns about for vertical scroll.
 *
 *   `minWidth` on the <table>, not on the box. That is what makes the table
 *   overflow its container rather than crushing its columns.
 *
 * ROW NAVIGATION
 * ───────────────────────────────────────────────────────────────────────────
 * A real <Link> lives in the primary cell and carries keyboard access, ⌘-click,
 * middle-click and the status-bar URL preview. The <tr> click is a mouse
 * convenience layered on top. The tempting alternative — a stretched
 * `after:absolute after:inset-0` overlay covering the whole row — was rejected
 * deliberately: it makes every other cell's text unselectable, and copying an
 * id, a phone number or an email out of a row is something moderators do all
 * day. One tab stop per row, all text still selectable.
 */

export type ColumnAlign = "start" | "center" | "end";

export type DataTableColumn<TRow> = {
  /** Stable id. Used as the React key and for the skeleton's column mapping. */
  id: string;
  header: ReactNode;
  cell: (row: TRow) => ReactNode;
  align?: ColumnAlign;
  /** CSS width for the <col>, e.g. `"12rem"` or `"1%"` to shrink-to-fit. */
  width?: string;
  /** The API's sort field name. Present = this column is sortable. */
  sortKey?: string;
  /** Header text is for assistive tech only (icon / actions columns). */
  headerHidden?: boolean;
  /** This cell holds its own controls; a click inside it must not navigate. */
  interactive?: boolean;
  /** Carries the row link. Defaults to the first non-interactive column. */
  primary?: boolean;
  /** Skeleton bar width for this column while loading. Default: `"70%"`. */
  skeletonWidth?: string;
  className?: string;
  headerClassName?: string;
};

export type DataTableProps<TRow> = {
  view: ListView<TRow>;
  columns: ReadonlyArray<DataTableColumn<TRow>>;
  /** Stable identity per row. Index keys break selection and re-order badly. */
  rowKey: (row: TRow) => string;
  /** Accessible name. Rendered as a <caption>, visually hidden by default. */
  caption: string;
  captionVisible?: boolean;

  /** Row destination. Renders a real link in the primary cell. */
  rowHref?: (row: TRow) => Route;
  /** Row selection, for a master-detail pane. Renders a button instead. */
  onRowSelect?: (row: TRow) => void;
  selectedRowKey?: string | null;

  sort?: ListSort | null;
  onToggleSort?: (key: string) => void;

  /** Copy for the genuinely-empty case. The filtered case is handled for you. */
  empty: ListEmptyCopy;
  filteredEmptyTitle?: string;
  filteredEmptyDescription?: string;
  onRetry?: () => void;

  /** Skeleton row count. Match the usual page size so the box doesn't resize. */
  loadingRows?: number;
  /** Rows are one page stale while the next loads — dims the table. */
  isPlaceholder?: boolean;

  /**
   * Forces horizontal overflow below this width, e.g. `"64rem"`. Without it
   * columns compress until they are unreadable instead of scrolling.
   */
  minWidth?: string;
  /**
   * Bounds the table to the height its parent gives it and puts the ONE scroll
   * box (both axes) inside. Required for `stickyHeader`, and the shape to use
   * inside `<ListPane scroll="child">`.
   */
  fillHeight?: boolean;
  /**
   * Pins the header row while rows scroll under it. **Only works with
   * `fillHeight`** — see the note on the scroll box below for why.
   */
  stickyHeader?: boolean;
  /** Rendered inside the card, below the scroll box. Pagination goes here. */
  footer?: ReactNode;
  className?: string;
};

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right",
};

export function DataTable<TRow>({
  view,
  columns,
  rowKey,
  caption,
  captionVisible = false,
  rowHref,
  onRowSelect,
  selectedRowKey = null,
  sort = null,
  onToggleSort,
  empty,
  filteredEmptyTitle,
  filteredEmptyDescription,
  onRetry,
  loadingRows = 8,
  isPlaceholder = false,
  minWidth,
  fillHeight = false,
  stickyHeader = false,
  footer,
  className,
}: DataTableProps<TRow>) {
  const { ref: scrollRef, isOverflowing } = useHorizontalOverflow<HTMLDivElement>();

  // These states replace the table outright rather than rendering a message in
  // a colSpan cell: column headers above "you don't have permission" imply the
  // data is there and merely hidden.
  if (view.kind === "failure") {
    return <ListFailureState failure={view.failure} onRetry={onRetry} />;
  }
  if (view.kind === "empty") {
    return (
      <ListEmptyState
        narrowed={view.narrowed}
        onClearAll={view.clearAll}
        empty={empty}
        filteredTitle={filteredEmptyTitle}
        filteredDescription={filteredEmptyDescription}
      />
    );
  }

  const isLoading = view.kind === "loading";
  const rows = view.kind === "ready" ? view.rows : [];

  const primaryColumn =
    columns.find((column) => column.primary) ??
    columns.find((column) => !column.interactive) ??
    columns[0];

  const isNavigable = Boolean(rowHref || onRowSelect);

  return (
    <div
      className={cn(
        // `relative` is load-bearing. A `headerHidden` column renders its label in an
        // `.sr-only` span, which Tailwind positions ABSOLUTE. With every ancestor
        // static its containing block becomes the viewport, so neither this box's
        // `overflow-hidden` nor the scroll region's `overflow-x` can clip it — the
        // whole document scrolls sideways under the fixed chrome (measured: 1749px
        // scrollWidth against a 1440px viewport). Establishing a containing block
        // here confines it.
        "relative w-full min-w-0 overflow-hidden rounded-card border border-border bg-surface shadow-card",
        fillHeight && "flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      <div
        ref={scrollRef}
        // A scrollable region must be keyboard-operable (WCAG 2.1.1) — but only
        // when it is actually scrolling, or every table costs a pointless tab
        // stop. `useHorizontalOverflow` measures instead of assuming.
        {...(isOverflowing
          ? { tabIndex: 0, role: "region" as const, "aria-label": `${caption}, scrollable` }
          : {})}
        className={cn(
          "w-full min-w-0 scrollbar-slim focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          // A sticky <thead> sticks to its nearest SCROLLING ancestor. CSS will
          // not let a box scroll horizontally without also becoming a vertical
          // scroll container (`overflow-y: visible` computes to `auto` the
          // moment `overflow-x` is not `visible`), so this box is always the
          // one a sticky header attaches to. If the vertical scrolling happens
          // in an ancestor instead, the header sticks to a box that never
          // scrolls vertically — i.e. it does nothing, and the header slides
          // away with the rows. `fillHeight` fixes that by making THIS box the
          // bounded vertical scroller as well.
          fillHeight ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto",
        )}
      >
        <table
          className="w-full border-collapse text-left"
          style={minWidth ? { minWidth } : undefined}
          aria-busy={isLoading || isPlaceholder ? true : undefined}
        >
          <caption
            className={cn(
              captionVisible
                ? "px-4 py-3 text-left text-sm font-bold text-fg"
                : "sr-only",
            )}
          >
            {caption}
          </caption>

          {/* Widths on <col> rather than on every <td>: one declaration per
              column, and the browser keeps them stable between the skeleton
              and the loaded rows so nothing jumps when data lands. */}
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>

          <thead
            className={cn(
              "border-b border-border bg-surface-2",
              stickyHeader && "sticky top-0 z-10",
            )}
          >
            <tr>
              {columns.map((column) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  direction={
                    column.sortKey && sort?.key === column.sortKey ? sort.direction : null
                  }
                  onToggleSort={onToggleSort}
                />
              ))}
            </tr>
          </thead>

          <tbody
            className={cn(
              "divide-y divide-border",
              // Stale rows are visibly stale. Dimming without saying why is
              // still better than showing one page's data under another page's
              // controls as though it were current.
              isPlaceholder && "opacity-55 transition-opacity",
            )}
          >
            {isLoading
              ? Array.from({ length: loadingRows }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-3">
                        <Skeleton
                          className="h-4"
                          style={{ width: column.skeletonWidth ?? "70%" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <BodyRow
                      key={key}
                      row={row}
                      columns={columns}
                      primaryColumnId={primaryColumn?.id}
                      rowHref={rowHref}
                      onRowSelect={onRowSelect}
                      isSelected={selectedRowKey !== null && selectedRowKey === key}
                      isNavigable={isNavigable}
                    />
                  );
                })}
          </tbody>
        </table>
      </div>

      {footer ? <div className="shrink-0 border-t border-border">{footer}</div> : null}
    </div>
  );
}

function HeaderCell<TRow>({
  column,
  direction,
  onToggleSort,
}: {
  column: DataTableColumn<TRow>;
  direction: SortDirection | null;
  onToggleSort?: (key: string) => void;
}) {
  const sortKey = column.sortKey;
  const sortable = Boolean(sortKey && onToggleSort);
  const align = column.align ?? "start";

  return (
    <th
      scope="col"
      // Only ever on a sortable column. `aria-sort="none"` on a column that
      // cannot be sorted announces a control that does not exist.
      aria-sort={sortable ? (direction ? SORT_ARIA[direction] : "none") : undefined}
      className={cn(
        "micro-label px-4 py-2.5 font-bold whitespace-nowrap",
        ALIGN_CLASS[align],
        column.headerClassName,
      )}
    >
      {column.headerHidden ? (
        <span className="sr-only">{column.header}</span>
      ) : sortable && sortKey ? (
        <button
          type="button"
          onClick={() => onToggleSort?.(sortKey)}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 transition-colors",
            "hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2",
            direction && "text-fg-muted",
            align === "end" && "flex-row-reverse",
          )}
        >
          {column.header}
          <SortIcon direction={direction} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

const SORT_ARIA: Record<SortDirection, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
};

function SortIcon({ direction }: { direction: SortDirection | null }) {
  // The neutral chevron is what advertises that the column is sortable at all;
  // showing an arrow only once sorted hides the affordance until it is used.
  if (!direction) return <ChevronsUpDown aria-hidden className="size-3 text-fg-faint" />;
  return direction === "asc" ? (
    <ArrowUp aria-hidden className="size-3" />
  ) : (
    <ArrowDown aria-hidden className="size-3" />
  );
}

/** Elements that handle their own clicks; a click landing here must not navigate. */
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, [role="button"]';

function BodyRow<TRow>({
  row,
  columns,
  primaryColumnId,
  rowHref,
  onRowSelect,
  isSelected,
  isNavigable,
}: {
  row: TRow;
  columns: ReadonlyArray<DataTableColumn<TRow>>;
  primaryColumnId: string | undefined;
  rowHref?: (row: TRow) => Route;
  onRowSelect?: (row: TRow) => void;
  isSelected: boolean;
  isNavigable: boolean;
}) {
  const href = rowHref?.(row);

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (!isNavigable) return;
    // Let the control that was actually clicked do its job.
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;
    // Someone dragging to select an email should get the selection, not a
    // navigation that throws it away.
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    // ⌘/ctrl/shift-click is "open elsewhere", which only the real <Link> can
    // honour. Doing nothing is right; hijacking it into a same-tab push is not.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    if (onRowSelect) onRowSelect(row);
    else if (href) {
      const link = event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]");
      // Click the real link rather than calling router.push, so prefetch,
      // scroll restoration and typed routes all behave identically to a
      // direct click on the primary cell.
      link?.click();
    }
  };

  return (
    <tr
      onClick={isNavigable ? handleRowClick : undefined}
      aria-selected={onRowSelect ? isSelected : undefined}
      data-selected={isSelected ? "" : undefined}
      className={cn(
        "transition-colors",
        isNavigable && "cursor-pointer hover:bg-surface-2",
        isSelected && "bg-primary-soft/60 hover:bg-primary-soft/60",
      )}
    >
      {columns.map((column) => {
        const content = column.cell(row);
        const isPrimary = column.id === primaryColumnId;

        return (
          <td
            key={column.id}
            className={cn(
              "px-4 py-3 align-middle",
              ALIGN_CLASS[column.align ?? "start"],
              column.className,
            )}
          >
            {isPrimary && href ? (
              <Link
                href={href}
                data-row-link
                className="rounded-control font-semibold text-fg outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {content}
              </Link>
            ) : isPrimary && onRowSelect ? (
              <button
                type="button"
                onClick={() => onRowSelect(row)}
                className="rounded-control text-left font-semibold text-fg outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </td>
        );
      })}
    </tr>
  );
}
