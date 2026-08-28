"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ListView } from "@/hooks/use-list-query";
import { ListEmptyState, ListFailureState, type ListEmptyCopy } from "./list-feedback";

/**
 * The left-hand list of a `SelectionPanelLayout`.
 *
 * A narrow panel, not a table — columns do not fit in 20rem and a moderator
 * skimming a queue wants one scannable line per row, not eight cells. Handles
 * the same four states as DataTable and in the same order (loading -> failure
 * -> empty -> rows), because the panel failing quietly while the detail pane
 * keeps showing the last record is a genuinely confusing screen.
 *
 * Semantics: a `<ul>` of links, with `aria-current="page"` on the active row.
 * That is what makes the panel announce as a list of N and lets arrow keys and
 * screen-reader list navigation work without any JS of ours.
 */
export function SelectionList<TRow>({
  view,
  rowKey,
  renderItem,
  itemHref,
  onSelect,
  selectedKey = null,
  empty,
  onRetry,
  loadingRows = 8,
  label,
  className,
}: {
  view: ListView<TRow>;
  rowKey: (row: TRow) => string;
  renderItem: (row: TRow, state: { selected: boolean }) => ReactNode;
  /** Link-based selection — survives reload and is shareable. Preferred. */
  itemHref?: (row: TRow) => Route;
  /** In-place selection, for a panel whose detail is not its own route. */
  onSelect?: (row: TRow) => void;
  selectedKey?: string | null;
  empty: ListEmptyCopy;
  onRetry?: () => void;
  loadingRows?: number;
  /** Accessible name for the list, e.g. "Flagged comments". */
  label: string;
  className?: string;
}) {
  if (view.kind === "loading") {
    return (
      <div className={cn("space-y-1 p-2", className)} aria-busy>
        {Array.from({ length: loadingRows }).map((_, index) => (
          <div key={index} className="rounded-control px-3 py-2.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="mt-2 h-2.5 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (view.kind === "failure") {
    return (
      <div className={cn("p-3", className)}>
        <ListFailureState failure={view.failure} onRetry={onRetry} />
      </div>
    );
  }

  if (view.kind === "empty") {
    return (
      <div className={cn("p-3", className)}>
        <ListEmptyState narrowed={view.narrowed} onClearAll={view.clearAll} empty={empty} />
      </div>
    );
  }

  return (
    <ul aria-label={label} className={cn("space-y-0.5 p-2", className)}>
      {view.rows.map((row) => {
        const key = rowKey(row);
        const selected = selectedKey !== null && selectedKey === key;
        const href = itemHref?.(row);

        const content = renderItem(row, { selected });
        const classes = cn(
          "block w-full rounded-control px-3 py-2.5 text-left transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          selected ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2",
        );

        return (
          <li key={key}>
            {href ? (
              <Link href={href} aria-current={selected ? "page" : undefined} className={classes}>
                {content}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onSelect?.(row)}
                aria-current={selected ? "true" : undefined}
                className={classes}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Two-line panel row: a title that truncates and a quieter meta line. */
export function SelectionListItem({
  title,
  meta,
  trailing,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <span className="flex items-start justify-between gap-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{title}</span>
        {meta ? <span className="mt-0.5 block truncate text-[11px] opacity-70">{meta}</span> : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </span>
  );
}
