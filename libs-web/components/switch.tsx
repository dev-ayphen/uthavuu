"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../lib/cn";

/**
 * A switch that is actually a switch.
 *
 * WHY A CHECKBOX RATHER THAN A BUTTON
 * ───────────────────────────────────────────────────────────────────────────
 * Space, Enter, the checked state in the accessibility tree, form participation
 * and React Hook Form's `register()` all come free. `role="switch"` only changes
 * how it is ANNOUNCED (on/off rather than checked/unchecked); the element
 * underneath is the one the platform already made work.
 *
 * THERE IS NO DECORATIVE VARIANT, ON PURPOSE
 * ───────────────────────────────────────────────────────────────────────────
 * The screen this was written for is a rebuild of a prototype that rendered
 * fourteen toggles, ELEVEN of which had no handler and no state — their on/off
 * position was computed from the array index, so the second item in every group
 * rendered green regardless of meaning and clicking any of them did nothing.
 * The rule recorded from that: a switch that looks like a stop button and isn't
 * one is worse than no switch. So the input props are spread straight onto a
 * real `<input>`; there is no `checked`-without-`onChange` shape to reach for.
 *
 * THE KNOB AND TRACK ARE SIBLINGS OF THE INPUT, NOT DESCENDANTS OF ONE.
 * `peer-checked:` only reaches a sibling. A knob nested inside the track would
 * not be one, and would never move.
 */
export function Switch({
  label,
  description,
  disabled,
  className,
  id: providedId,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "className"> & {
  label: string;
  /** Says what turning it ON does. Excluded from the accessible NAME. */
  description?: ReactNode;
  className?: string;
}) {
  const generated = useId();
  const id = providedId ?? generated;
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <label
      htmlFor={id}
      className={cn(
        // The whole row is the hit target: a 36px track is a small thing to ask
        // an operator to hit, and the label they are reading is right there.
        "flex cursor-pointer items-start justify-between gap-4 rounded-control border border-border bg-surface-2 px-3.5 py-3 transition-colors",
        "hover:border-border-strong",
        disabled && "cursor-not-allowed opacity-60 hover:border-border",
        className,
      )}
    >
      <span className="min-w-0">
        <span id={labelId} className="block text-xs font-bold text-fg">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs text-fg-subtle">
            {description}
          </span>
        ) : null}
      </span>

      <span className="relative inline-flex shrink-0 items-center pt-0.5">
        <input
          id={id}
          type="checkbox"
          role="switch"
          disabled={disabled}
          // Named by the title alone. Without this the accessible name would
          // swallow the whole description, which a screen-reader user then
          // hears twice — once as the name, once as the description.
          aria-labelledby={labelId}
          aria-describedby={description ? descriptionId : undefined}
          className="peer sr-only"
          {...input}
        />
        {/* Track. */}
        <span
          aria-hidden
          className={cn(
            "block h-5 w-9 rounded-pill border border-border-strong bg-surface-3 transition-colors",
            "peer-checked:border-primary peer-checked:bg-primary",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface-2",
          )}
        />
        {/* Knob. A sibling of the input, so `peer-checked:` reaches it. */}
        <span
          aria-hidden
          className={cn(
            // left/top land the 16px knob inside the track's 18px inner box: 1px
            // past the track border, plus the 0.125rem the wrapper is padded by.
            "pointer-events-none absolute top-1 left-px size-4 rounded-pill bg-surface shadow-card transition-transform",
            "peer-checked:translate-x-4",
          )}
        />
      </span>
    </label>
  );
}
