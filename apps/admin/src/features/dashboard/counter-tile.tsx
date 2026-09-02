import { Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MetricTile, StatCard, type Accent } from "@/components/ui";
import { formatCount, type Counter } from "./use-dashboard-summary";

/**
 * The dashboard's tiles, each carrying the reason its number reads as it does.
 *
 * WHY A TILE NEEDS A FOOTNOTE AT ALL
 * ───────────────────────────────────────────────────────────────────────────
 * Half the compact tiles render an em dash, and an em dash on its own is
 * ambiguous in the worst way: it could mean "not tracked", "the API is behind",
 * or "something is broken", and an operator cannot tell which. "Fake reports"
 * is permanently blank — only comments can be flagged in Uthavu — and without
 * somewhere to say that, the same person re-discovers the same non-bug every
 * few weeks. `Counter.note` carries that sentence; this renders it.
 *
 * A native `title` plus a visible ⓘ, not a bespoke popover: it is the idiom the
 * console already uses (the timezone Badge, every truncated table cell), it
 * needs no portal or focus management, and the visible mark is what stops the
 * tooltip from being a secret. The same text is repeated in an `sr-only` span,
 * because `title` on a non-interactive element is announced inconsistently.
 */

function Noted({ note, children }: { note: string | null; children: ReactNode }) {
  if (!note) return <>{children}</>;

  return (
    // `grid` so the single child still stretches to the row height, exactly as
    // it would if it were the grid item itself. `relative` contains the mark.
    <div className="relative grid cursor-help" title={note}>
      {children}
      <Info
        aria-hidden
        className="pointer-events-none absolute right-2 bottom-2 size-3 text-fg-faint"
      />
      <span className="sr-only">{note}</span>
    </div>
  );
}

/** One of the four headline totals across the top. */
export function StatTile({
  label,
  counter,
  sublabel,
  icon,
  accent,
}: {
  label: string;
  counter: Counter;
  sublabel?: string;
  icon: LucideIcon;
  accent?: Accent;
}) {
  return (
    <Noted note={counter.note}>
      <StatCard
        label={label}
        value={formatCount(counter.value)}
        sublabel={sublabel}
        icon={icon}
        accent={accent}
      />
    </Noted>
  );
}

/** One of the eight compact counters below. */
export function CounterTile({
  label,
  counter,
  icon,
  accent,
}: {
  label: string;
  counter: Counter;
  icon: LucideIcon;
  accent?: Accent;
}) {
  return (
    <Noted note={counter.note}>
      <MetricTile label={label} value={formatCount(counter.value)} icon={icon} accent={accent} />
    </Noted>
  );
}
