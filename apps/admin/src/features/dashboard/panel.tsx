import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui";
import type { Accent } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The row shell every dashboard panel shares.
 *
 * Deliberately NOT a client component: it holds no state and no handlers, so
 * the segment's `loading.tsx` — a Server Component — can reuse
 * `PanelRowSkeleton` without dragging a client bundle in behind it.
 *
 * ONE LIST STYLE, NOT THREE
 * ───────────────────────────────────────────────────────────────────────────
 * The activity feed defined this shape first; Urgent requests and Latest
 * flagged comments needed the same one. It lives here rather than being
 * re-typed in each panel so the three cannot drift into three slightly
 * different rows on a single screen — which is what a reader notices long
 * before they can say why the page looks untidy.
 *
 * SCROLL OWNERSHIP (the pattern each panel applies, see PanelScroll)
 * ───────────────────────────────────────────────────────────────────────────
 * A panel bounds its own height and scrolls its rows INSIDE that bound, so a
 * panel filling up never pushes the tiles above it off the page. The scroll
 * pane carries `min-h-0` because a flex child defaults to `min-height: auto`
 * and will not shrink below its content — without it `overflow-y-auto` never
 * engages, the scroll escapes to the document, and the card header slides away
 * with the rows.
 */

/**
 * Accent tokens for the per-row chip. Both halves of every pair are defined in
 * light and dark in globals.css, so no row needs a `dark:` override. Keyed by
 * the shared `Accent` union, so a colour that does not exist cannot be named.
 */
export const PANEL_CHIP: Record<Accent, string> = {
  emerald: "bg-accent-emerald-soft text-accent-emerald-fg",
  blue: "bg-accent-blue-soft text-accent-blue-fg",
  amber: "bg-accent-amber-soft text-accent-amber-fg",
  rose: "bg-accent-rose-soft text-accent-rose-fg",
  violet: "bg-accent-violet-soft text-accent-violet-fg",
  cyan: "bg-accent-cyan-soft text-accent-cyan-fg",
  pink: "bg-accent-pink-soft text-accent-pink-fg",
  slate: "bg-accent-slate-soft text-accent-slate-fg",
};

/**
 * The one scrolling region inside a panel body.
 *
 * `min-h-0` is not optional — see the header. The parent must be a `flex
 * flex-col` whose height is bounded, either outright or by a `max-h`.
 *
 * `flex-auto`, NOT `flex-1`. They differ only in `flex-basis` — `0` versus
 * `auto` — and that one word decides whether a card whose height is content-
 * driven can size itself at all. With basis `0` this pane contributes nothing
 * to its parent's height, so a `min-h`/`max-h` card collapses to its floor and
 * the `max-h` never engages. With basis `auto` the pane's rows push the card
 * out to the ceiling and only then start scrolling, which is the behaviour the
 * panels are bounded for. Inside a card with a FIXED height (the activity
 * feed) the two are identical, because grow and shrink both resolve to the
 * space available.
 */
export function PanelScroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-auto overflow-y-auto">{children}</div>;
}

/**
 * A panel's empty / failure message, vertically centred in whatever room is
 * left — and scrollable rather than spilling out of the card if the message is
 * taller than the room.
 *
 * `my-auto` on the CHILD rather than `justify-center` here: in flex layout an
 * auto margin absorbs free space and resolves to zero when there is none, so
 * the top of an overlong message stays reachable. `justify-content: center`
 * would centre the overflow instead, putting the first line above the scroll
 * container's start edge where nothing can scroll to it.
 */
export function PanelCenter({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-auto flex-col overflow-y-auto px-4">{children}</div>
  );
}

/**
 * A row.
 *
 * It is a link only when there is somewhere true to go: a dead <a> that
 * navigates nowhere is worse than plain text, so `href: null` renders a div.
 */
export function PanelRow({
  href,
  icon,
  accent,
  meta,
  metaClassName = "tabular text-fg-faint",
  children,
}: {
  href: Route | null;
  /** Sized by the caller — `size-3.5` inside the 1.75rem chip. */
  icon: ReactNode;
  accent: Accent;
  /** Right-hand column: a timestamp, a countdown. Kept to one line. */
  meta?: ReactNode;
  metaClassName?: string;
  children: ReactNode;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control",
          PANEL_CHIP[accent],
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">{children}</span>

      {meta ? (
        <span className={cn("mt-0.5 shrink-0 whitespace-nowrap text-[11px]", metaClassName)}>
          {meta}
        </span>
      ) : null}
    </>
  );

  // Full-bleed, with the card's horizontal padding carried by the row itself.
  // The tempting alternative — a padded scroll pane and `-mx-2` on the row to
  // let the hover highlight bleed back out — overhangs the scroll container's
  // content box on the right, and `overflow-y-auto` computes the other axis to
  // `auto`, so the pane grows a horizontal scrollbar it never needed.
  const shape = "flex items-start gap-3 px-4 py-2.5";

  if (!href) return <div className={shape}>{body}</div>;

  return (
    <Link
      href={href}
      className={cn(
        shape,
        "outline-none transition-colors hover:bg-surface-2",
        // `ring-inset` for the same reason: an outset ring on a full-bleed row
        // would overflow the pane it lives in.
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      {body}
    </Link>
  );
}

/**
 * Shaped like the loaded rows — chip, one or two lines of text, and the meta
 * column. A skeleton that does not match what replaces it is worse than none,
 * because the panel jumps the moment data lands.
 */
export function PanelRowSkeleton({
  rows = 3,
  lines = 2,
}: {
  rows?: number;
  /** 1 for a single-line row, 2 when the loaded row carries a subtitle. */
  lines?: 1 | 2;
}) {
  return (
    <div className="min-h-0 flex-auto overflow-hidden px-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5">
          <Skeleton className="size-7 shrink-0 rounded-control" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/5" />
            {lines === 2 ? <Skeleton className="h-2.5 w-2/5" /> : null}
          </div>
          <Skeleton className="h-2.5 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * A whole panel body mid-load: rows, then the footnote line every loaded panel
 * ends with.
 *
 * Shared by the panels' own loading branch and by the page-level
 * `DashboardSkeleton`, so the placeholder is the same height in both — and so
 * neither can be updated without the other when a panel changes shape.
 */
export function PanelBodySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      <PanelRowSkeleton rows={rows} />
      <Skeleton className="mx-auto mt-3 h-2.5 w-40 shrink-0" />
    </>
  );
}

/**
 * The line under a panel's rows.
 *
 * Always says something: either that the list is complete, or how much of it
 * is not shown. Leaving it off would make a truncated panel indistinguishable
 * from a complete one, and an operator would act on the shorter number.
 */
export function PanelFootnote({ children }: { children: ReactNode }) {
  return <p className="px-4 pt-3 text-center text-[11px] text-fg-faint">{children}</p>;
}
