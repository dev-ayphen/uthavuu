import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Label + control + inline error.
 *
 * A field error belongs here, next to the control that caused it — never in a
 * toast. A toast leaves the operator with a form they cannot see how to fix.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="micro-label block text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-faint">{hint}</p>
      ) : null}
    </div>
  );
}
