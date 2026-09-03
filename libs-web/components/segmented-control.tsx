"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * A run of mutually exclusive filters, shown all at once.
 *
 * WHY THESE ARE BUTTONS AND NOT `role="tablist"`
 * ───────────────────────────────────────────────────────────────────────────
 * ARIA tabs promise a tabpanel each, arrow-key roving focus, and a relationship
 * between a tab and the panel it reveals. This is one table being filtered, not
 * N panels. Announcing it as tabs sends a screen-reader user hunting for panels
 * that do not exist. `role="group"` + `aria-pressed` describes what is actually
 * happening — a toggle in a set — and keeps Tab moving through the options the
 * way a keyboard user expects of a filter row.
 *
 * WHY IT HOLDS NO STATE
 * ───────────────────────────────────────────────────────────────────────────
 * Both callers drive it from the URL via `useListState`, which is what keeps a
 * pasted link and a click on the same option the same view. A control with its
 * own `useState` would silently become a second source of truth the first time
 * someone reloaded the page. `value`/`onChange` only.
 *
 * `value` IS THE EMPTY STRING FOR "All", not the string "all". The resting
 * state has to be the absence of a filter, or `isNarrowed` starts lying and an
 * empty table says "nothing matched your filters" when nothing was filtered.
 */

export type SegmentedOption = {
  /** `""` for the resting "All" option. */
  value: string;
  label: ReactNode;
};

export type SegmentedControlVariant = "underline" | "enclosed";

export type SegmentedControlProps = {
  /** Names the whole group for a screen reader, e.g. "Filter tickets by status". */
  label: string;
  options: readonly SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * `underline` sits on a section rule and reads as a page-level filter;
   * `enclosed` sits in a tinted track and reads as a control inside a toolbar.
   */
  variant?: SegmentedControlVariant;
  className?: string;
};

const CONTAINER: Record<SegmentedControlVariant, string> = {
  underline: "flex flex-wrap items-center gap-1 border-b border-border pb-2",
  enclosed: "flex flex-wrap items-center gap-1 rounded-control border border-border bg-surface-2 p-1",
};

/**
 * The focus ring's offset colour has to match what the option actually sits on,
 * or the ring is drawn over the wrong ground and appears to touch the button.
 */
const OPTION: Record<SegmentedControlVariant, { base: string; on: string; off: string }> = {
  underline: {
    base: "focus-visible:ring-offset-canvas focus-visible:outline-none",
    on: "bg-primary-soft text-primary-soft-fg",
    off: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  },
  enclosed: {
    base: "outline-none focus-visible:ring-offset-surface-2",
    on: "bg-surface text-fg shadow-card",
    off: "text-fg-subtle hover:bg-surface/60 hover:text-fg",
  },
};

export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  variant = "underline",
  className,
}: SegmentedControlProps) {
  const style = OPTION[variant];

  return (
    <div role="group" aria-label={label} className={cn(CONTAINER[variant], className)}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value || "__all__"}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              // Each variant carries its own outline reset verbatim: the two
              // originals wrote it differently (`focus-visible:outline-none` vs
              // `outline-none`) and both are preserved rather than harmonised,
              // because harmonising is a change to rendered output.
              style.base,
              selected ? style.on : style.off,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
