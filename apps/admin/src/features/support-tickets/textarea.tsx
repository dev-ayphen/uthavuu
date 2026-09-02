import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * A multi-line input wearing the console's tokens.
 *
 * ⚠ THIS IS THE THIRD COPY. PROMOTE IT.
 * ───────────────────────────────────────────────────────────────────────────
 * `@/components/ui` has `Input` but no `Textarea`. The console now hand-rolls
 * one in three places with the same class list:
 *
 *   features/moderation/confirm-action-dialog.tsx  (inline, in the reason box)
 *   features/announcements/textarea.tsx            (which already flagged this)
 *   this file
 *
 * Announcements' copy says the right home is `components/ui` and that it was
 * not put there because `src/components/ui/` is shared surface and that work
 * was scoped to its own feature. This work is scoped the same way, to
 * `features/support-tickets/**`, so the same constraint applies and the same
 * note is repeated rather than quietly ignored. Promoting it — one new file in
 * `components/ui`, three imports changed, two files deleted — is flagged in the
 * handover and is now overdue.
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
