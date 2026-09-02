import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * A multi-line input wearing the console's tokens.
 *
 * WHY IT LIVES IN THIS FEATURE
 * ───────────────────────────────────────────────────────────────────────────
 * `@/components/ui` has `Input` but no `Textarea` — the only other multi-line
 * control in the console is hand-rolled inline in
 * `features/moderation/confirm-action-dialog.tsx` with the same class list.
 * This is the second copy, which means the right home is `components/ui`; it is
 * not there because `src/components/ui/` is shared surface and this work is
 * scoped to `features/announcements/**`. Promoting it (and folding the
 * dialog's copy into it) is a one-file change flagged in the handover.
 *
 * The classes mirror `Input` exactly rather than approximately — same border,
 * same inset surface, same focus ring, same `aria-[invalid=true]` treatment —
 * so a form mixing the two does not have one control that looks subtly wrong.
 */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-control border border-border bg-surface-inset px-3.5 py-2.5 text-fg",
        "placeholder:text-fg-faint",
        "outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-danger-fg",
        className,
      )}
      {...props}
    />
  );
}
