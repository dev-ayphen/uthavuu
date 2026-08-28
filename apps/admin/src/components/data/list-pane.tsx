"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { useViewportFillHeight } from "@/hooks/use-viewport-fill-height";
import { cn } from "@/lib/cn";

/**
 * Mode B for a list: the toolbar and the pagination stay put, only rows move.
 *
 * Worth it when the operator is working THROUGH a queue — flagged comments,
 * support tickets — because the filters and the page controls are the tools of
 * that job and hunting for them at the bottom of a thousand rows is the whole
 * problem. An ordinary reference table is better off in Mode A (plain
 * `PageLayout`, document scroll), which is what CLAUDE.md's archetype table
 * prescribes; this is the deliberate exception, not the default.
 *
 * THE THREE RULES, AND WHY EACH ONE IS LOAD-BEARING
 * ───────────────────────────────────────────────────────────────────────────
 *  1. BOUNDED HEIGHT on the root. `overflow-y-auto` on an unbounded box never
 *     engages — there is nothing to overflow — and the scroll silently becomes
 *     the document's.
 *  2. `min-h-0` on the scrolling flex child. A flex item defaults to
 *     `min-height: auto`, which refuses to shrink below its content, so the box
 *     grows to fit all 500 rows and (1) is undone. This single missing class is
 *     the bug CLAUDE.md calls out by name, and its symptom is the sidebar
 *     scrolling away with the table.
 *  3. `shrink-0` on the panes that must NOT scroll, or flex steals height from
 *     the toolbar to give to the rows.
 */
export function ListPane({
  toolbar,
  footer,
  children,
  scroll = "pane",
  /** Breathing room below the pane, so it doesn't butt against the viewport. */
  bottomGap = 20,
  /** Changing this scrolls the rows back to the top — pass the page number. */
  resetKey,
  className,
}: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /**
   * Who owns the vertical scroll.
   *
   * `"pane"` (default) — this component scrolls its children. Right for a list
   * of cards or a `SelectionList`.
   *
   * `"child"` — the child scrolls itself; this only bounds and clips. Required
   * for `<DataTable fillHeight stickyHeader>`, because a sticky header can only
   * stick to the box that actually scrolls, and a table that scrolls
   * horizontally is unavoidably that box.
   */
  scroll?: "pane" | "child";
  bottomGap?: number;
  resetKey?: string | number;
  className?: string;
}) {
  const { ref, height } = useViewportFillHeight<HTMLDivElement>(bottomGap);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Landing on page 4 already scrolled halfway down page 3's rows reads as a
    // broken page. Only the pane moves; the document is deliberately untouched.
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <div
      ref={ref}
      style={{ height }}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card",
        className,
      )}
    >
      {toolbar ? (
        <div className="shrink-0 border-b border-border bg-surface px-4 py-3">{toolbar}</div>
      ) : null}

      {scroll === "pane" ? (
        /* The ONLY scroller in here. `min-h-0` is what lets it be one. */
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-slim">
          {children}
        </div>
      ) : (
        /* Bound and clip only. `overflow-hidden` is the second line of defence:
           if the child forgets its own `min-h-0`, the overflow is clipped here
           rather than escaping to the document and taking the sidebar with it. */
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      )}

      {footer ? (
        <div className="shrink-0 border-t border-border bg-surface">{footer}</div>
      ) : null}
    </div>
  );
}

/**
 * The bare bounded scroller, for composing a Mode B pane by hand.
 * Same rules; no toolbar or footer opinion.
 */
export function TableScrollRegion({
  children,
  bottomGap = 20,
  className,
}: {
  children: ReactNode;
  bottomGap?: number;
  className?: string;
}) {
  const { ref, height } = useViewportFillHeight<HTMLDivElement>(bottomGap);

  return (
    <div ref={ref} style={{ height }} className={cn("flex min-w-0 flex-col", className)}>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-slim">{children}</div>
    </div>
  );
}
