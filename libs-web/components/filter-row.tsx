import type { ReactNode } from "react";

import { InlineField } from "./inline-field";
import { Select } from "./select";
import { cn } from "../lib/cn";

/**
 * The shape of a filter row, minus anything that knows where the values live.
 *
 * A list page's filter row is the same three ingredients every time: a strip
 * that wraps, a tint that says "this control is narrowing the list", and a
 * labelled dropdown. Six rows across the console had re-typed all three by
 * hand, and the copies had already picked up differences — one row's tint was
 * applied to the wrapper instead of the control, another's `<select>` had no
 * label at all.
 *
 * WHY THESE LIVE HERE AND THE REST DOES NOT
 * ───────────────────────────────────────────────────────────────────────────
 * Everything below is a pure token consumer: it takes a value and an onChange
 * and knows nothing about the URL, the query cache or a permission. The parts
 * that DO read the list state — "Clear all", the live-region announcement, the
 * bound date pair — cannot follow, because they are wired to the app's
 * `useListState`. They stay in the app that owns that hook and compose these.
 */

/**
 * The tint that marks a control as "this one is narrowing the list".
 *
 * Without it, a filter row at rest and a filter row doing something look the
 * same at a glance, and an operator staring at three rows out of four hundred
 * has no visual cue as to which control did it. Exported rather than inlined so
 * the call sites cannot drift to five different greens.
 */
export const FILTER_ACTIVE_TINT = "border-primary-soft-border bg-primary-soft text-primary-soft-fg";

/** `cn`-ready: `className={cn("w-auto", filterTint(isFilterActive("status")))}`. */
export function filterTint(active: boolean) {
  return active ? FILTER_ACTIVE_TINT : undefined;
}

/**
 * The strip the controls sit on.
 *
 * `flex-wrap` and not a grid: the number of controls differs per page (one on
 * the flag queue, five on audit logs) and they are different widths, so a
 * column count would be wrong on every page but one. Wrapping also means a
 * narrow window pushes the last control onto a second line rather than
 * squeezing all of them below the width their labels need.
 */
export function FilterRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export type FilterOption = {
  value: string;
  label: string;
  /** Optional count, e.g. "Suspended (12)". Omit unless it is cheap and true. */
  count?: number;
};

export type FilterSelectProps = {
  label: string;
  /** The current value. `""` is the "no opinion" choice — see `allLabel`. */
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterOption[];
  /** Whether this control is currently narrowing the list, for the tint. */
  active?: boolean;
  /**
   * Label for the "no opinion" choice. Omit for a filter that always has a
   * value (an `audience` that defaults to `citizen` rather than to "everyone"),
   * and the blank option is not rendered at all.
   */
  allLabel?: string;
  /**
   * For a filter whose options are still loading, or whose catalogue endpoint
   * refused. Disabling rather than hiding keeps the row from reflowing, and a
   * disabled control is honest about being temporarily unusable.
   */
  disabled?: boolean;
  /** Extra classes on the `<select>` — a width cap, typically. */
  className?: string;
};

/**
 * One labelled dropdown in a filter row.
 *
 * `InlineField` mints the id and wires `htmlFor`, which is not optional here: a
 * bare `<select>` of statuses reads as "Active" with no clue what that is a
 * property OF, both visually and to a screen reader, which announces the value
 * and the word "combo box" and nothing else.
 *
 * The width is `w-auto` so the control is as wide as its longest option rather
 * than a fixed column — a run of equal-width dropdowns full of three-letter
 * values looks deliberate and reads as padding. Cap it per call site with
 * `className="max-w-56"` where an option label can run long.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  active = false,
  allLabel,
  disabled,
  className,
}: FilterSelectProps) {
  return (
    <InlineField label={label}>
      {(id) => (
        <Select
          id={id}
          size="sm"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn("w-auto", filterTint(active), className)}
        >
          {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.count === undefined ? option.label : `${option.label} (${option.count})`}
            </option>
          ))}
        </Select>
      )}
    </InlineField>
  );
}
