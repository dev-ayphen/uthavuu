import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * A multi-line input wearing the design system's tokens.
 *
 * The classes mirror `Input` exactly rather than approximately — same border,
 * same inset surface, same focus ring, same `aria-[invalid=true]` treatment —
 * so a form mixing the two never has one control that looks subtly wrong. If
 * `Input`'s appearance changes, change it here in the same edit.
 *
 * This is the promotion three separate feature copies asked for: the console
 * grew a hand-rolled `Textarea` in `features/announcements`, `features/sponsors`
 * and `features/support-tickets`, each one noting that the right home was the
 * shared UI layer and each one declining to put it there because that surface
 * belonged to somebody else. This is that home. Those copies still exist; their
 * owning lanes retire them by swapping the import.
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
