import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * A label BESIDE its control, for a filter row.
 *
 * The console's other field wrapper — `Field` — stacks label over control and
 * owns an error slot, which is right for a form. A filter bar is not a form:
 * the controls sit shoulder to shoulder on one line, there is no submit, and
 * nothing here can be invalid, so a stacked label would double the row's height
 * for no gain and an error slot would never render.
 *
 * WHY THE LABEL IS NOT OPTIONAL
 * ───────────────────────────────────────────────────────────────────────────
 * A bare `<select>` of statuses reads as "Active" with no clue what that is a
 * property OF — visually and, worse, to a screen reader, which announces the
 * value and the word "combo box" and nothing else. This wires `htmlFor` to the
 * control it is handed, so the association is structural rather than a matter
 * of the two sitting next to each other.
 *
 * `children` IS A FUNCTION so the id can go on the control without the caller
 * having to mint one and keep the two in sync — the mistake is invisible
 * (everything renders) and costs the association entirely.
 */
export function InlineField({
  label,
  children,
  className,
}: {
  label: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <label htmlFor={id} className="micro-label whitespace-nowrap">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
