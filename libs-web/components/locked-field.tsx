import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * A field the operator may read but not change, shown as the real value with
 * the real reason attached.
 *
 * WHY NOT A DISABLED INPUT
 * ───────────────────────────────────────────────────────────────────────────
 * A disabled control implies it could be enabled — that the operator is one
 * permission or one click away — which is false for a value that is immutable
 * for the life of the record. Hiding the field is worse: it leaves someone
 * wondering where the identifier went, and it hides the fact that the record
 * HAS one.
 *
 * There is also a live hazard behind the disabled version, learned on the admin
 * role field: React Hook Form treats a field registered with `disabled` as
 * having no value, so a disabled select submits `undefined` and blanks the
 * column on a PATCH. Not rendering a control at all means the form submits the
 * value it was opened with, which is the value the server already has.
 *
 * The dashed border is the console's established "this stands in for something
 * you cannot act on" — the same signal `EmptyState` uses.
 */
export function LockedField({
  label,
  children,
  reason,
  className,
}: {
  label: string;
  /**
   * The value element, styled by the caller.
   *
   * Not styled here on purpose. The two call sites this replaces render the
   * value differently — a `truncate text-xs font-semibold text-fg` span for a
   * role name, a `truncate font-mono text-xs text-fg` `<code>` for an immutable
   * key — and imposing one on both would change what is on screen. The shared
   * part is the label, the dashed row and the reason; the value is content.
   */
  children: ReactNode;
  /** Why it is locked. Never omit — a lock with no reason reads as a bug. */
  reason: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="micro-label block text-fg-muted">{label}</span>
      <p className="flex items-center gap-2 rounded-control border border-dashed border-border bg-surface-2 px-3 py-2.5">
        <Lock aria-hidden className="size-3.5 shrink-0 text-fg-faint" />
        {children}
      </p>
      <p className="text-xs text-fg-faint">{reason}</p>
    </div>
  );
}
