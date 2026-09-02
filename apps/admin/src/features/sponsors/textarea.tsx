import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * A multi-line input wearing the console's tokens.
 *
 * WHY IT LIVES IN THIS FEATURE
 * ───────────────────────────────────────────────────────────────────────────
 * `@/components/ui` has `Input` but no `Textarea`. There are now three copies
 * of this class list in the codebase — one hand-rolled inline in
 * `features/moderation/confirm-action-dialog.tsx`, one in
 * `features/announcements/textarea.tsx`, and this one — which means the right
 * home is unambiguously `components/ui`.
 *
 * It is not there because `src/components/ui/` is shared surface this work does
 * not own, and it does not import the announcements copy because that feature
 * is another session's UNCOMMITTED work (untracked in git as of writing).
 * Depending on a file that may be renamed or removed before it lands would
 * couple this feature's build to another agent's in-flight decisions. A third
 * copy is the smaller cost; promoting all three into `components/ui` is a
 * one-file change flagged in the handover.
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
