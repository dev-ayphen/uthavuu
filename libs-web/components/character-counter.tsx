import { cn } from "../lib/cn";

/**
 * "1840 / 2000", but only once it is worth reading.
 *
 * WHY IT STAYS HIDDEN UNTIL 80%
 * ───────────────────────────────────────────────────────────────────────────
 * The overwhelming majority of replies are nowhere near the cap, and a counter
 * on screen for all of them is one more number competing with the message the
 * operator is actually writing. It appears when it starts to be information.
 *
 * WHY IT EXISTS AT ALL WHEN THE SCHEMA ALREADY REFUSES TOO-LONG INPUT
 * ───────────────────────────────────────────────────────────────────────────
 * Because meeting a visible number beats meeting a 400. Zod catching it at
 * submit means the operator finds out after writing the whole thing; this tells
 * them while there is still time to be shorter.
 *
 * `aria-hidden` on purpose: a live counter that announced on every keystroke
 * would make the field unusable with a screen reader. The limit belongs in the
 * field's hint text, which is read once, and the schema's message is what
 * reports an actual overrun.
 */
export function CharacterCounter({
  value,
  max,
  /** Fraction of `max` at which the counter appears. */
  revealAt = 0.8,
  align,
  className,
}: {
  /** Character count, not the string — callers often already have it. */
  value: number;
  max: number;
  revealAt?: number;
  /**
   * Omitted by default. One caller sits in a `justify-between` row where the
   * flex line already places it and no text-align class was ever emitted;
   * adding one there would be a change to markup that renders identically
   * today but stops doing so the moment the box is wider than its text.
   */
  align?: "left" | "right";
  className?: string;
}) {
  if (value <= max * revealAt) return null;

  const over = value > max;

  return (
    <span
      aria-hidden
      className={cn(
        // `text-[11px]` is not a token and deliberately stays that way: it is
        // the value the two call sites already render, it appears ~40 times
        // across this console, and snapping it to the nearest token would
        // change what is on screen. Promoting it to a token is a design-system
        // decision for all 40, not a side effect of this component.
        "tabular text-[11px]",
        align === "right" && "text-right",
        align === "left" && "text-left",
        over ? "font-semibold text-danger-fg" : "text-fg-faint",
        className,
      )}
    >
      {value} / {max}
    </span>
  );
}
