"use client";

import { useId, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { cn } from "@/lib/cn";

/**
 * A switch that is actually a switch.
 *
 * WHY THIS COMPONENT HAS A COMMENT AT ALL
 * ───────────────────────────────────────────────────────────────────────────
 * The screen this file belongs to is a rebuild. The prototype's version
 * rendered fourteen toggles, ELEVEN of which had no `onClick` and no state —
 * their on/off position was computed from the array index, so the second item
 * in every group rendered green regardless of meaning and clicking any of them
 * did nothing at all (`docs/webadmin/07-platform-settings.md` §2A). The lesson
 * recorded there, §5A.3: "a switch that looks like a stop button and isn't one
 * is worse than no switch."
 *
 * So this is a real `<input type="checkbox" role="switch">`, and every use of
 * it is bound to a React Hook Form registration that reaches a real PATCH.
 * There is no uncontrolled visual-only variant to reach for, and no `checked`
 * prop without an `onChange` — the component cannot be used decoratively.
 *
 * WHY A CHECKBOX RATHER THAN A BUTTON
 * ───────────────────────────────────────────────────────────────────────────
 * Space, Enter behaviour, the checked state in the accessibility tree, form
 * participation and `register()` all come free. `role="switch"` only changes
 * how it is ANNOUNCED (on/off rather than checked/unchecked); the element
 * underneath is the one the platform already made work.
 *
 * The visible knob and track are two SIBLINGS of the input, not descendants of
 * one, so `peer-checked:` applies to each directly — a knob nested inside the
 * track would not be a sibling of the peer and would never move.
 */
export function SettingSwitch({
  label,
  description,
  registration,
  disabled,
  className,
}: {
  label: string;
  /** Says what turning it ON does. Excluded from the accessible NAME. */
  description: ReactNode;
  registration: UseFormRegisterReturn;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
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
        <span id={descriptionId} className="mt-0.5 block text-xs text-fg-subtle">
          {description}
        </span>
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
          aria-describedby={descriptionId}
          className="peer sr-only"
          {...registration}
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
            // left/top land the 16px knob inside the track's 18px inner box: 1px past
            // the track border, plus the 0.125rem the wrapper is padded down by.
            "pointer-events-none absolute left-px top-1 size-4 rounded-pill bg-surface shadow-card transition-transform",
            "peer-checked:translate-x-4",
          )}
        />
      </span>
    </label>
  );
}
