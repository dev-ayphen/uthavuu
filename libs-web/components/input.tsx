import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * `density`, NOT `size` — and this is a scar, not a preference.
 *
 * `Select` reclaims the name `size` because on a `<select>` the native
 * attribute means "how many options to show at once", which nothing wants.
 * Doing the same here does not work: `<input size>` is a number, and every form
 * control in this console is spread with React Hook Form's `{...register(...)}`,
 * whose return type carries the full `InputHTMLAttributes` surface. Narrowing
 * `size` to `"sm" | "md"` makes `number` unassignable and breaks EVERY
 * registered input in the app at once — six files, including two owned by other
 * lanes. A second name costs one word and collides with nothing.
 *
 * `compact` exists because four filter rows were spelling it out by hand as
 * `h-8 w-auto px-2.5 text-xs` on top of the default classes — three utilities
 * that have to be kept in step with `Select size="sm"` from memory.
 */
export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** `compact` for a filter bar, `default` for a form. */
  density?: "compact" | "default";
};

export function Input({ className, density = "default", ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-control border border-border bg-surface-inset text-fg",
        density === "compact" ? "h-8 w-auto px-2.5 text-xs" : "h-11 px-3.5",
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
