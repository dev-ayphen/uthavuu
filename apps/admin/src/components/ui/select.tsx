import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * A native `<select>` wearing the console's tokens.
 *
 * Native on purpose. A custom listbox would need focus trapping, typeahead,
 * arrow-key handling and a portal to escape the table's `overflow-x-auto`
 * clipping — four chances to ship something less accessible than the element
 * the platform already provides. Filters are short, flat option lists, which is
 * exactly what `<select>` is good at.
 *
 * `appearance-none` removes the OS chrome so the control matches Input; the
 * chevron is drawn back in and marked `aria-hidden`, and `pointer-events-none`
 * keeps clicks falling through to the select underneath.
 */
/**
 * `size` is omitted from the native attributes on purpose. On a <select> it
 * means "how many options to show at once", which turns the control into a
 * list box — never what a filter dropdown wants. Reclaiming the name keeps
 * this consistent with Button's `size="sm"` instead of inventing a synonym.
 */
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** Visually smaller variant, for a filter bar rather than a form. */
  size?: "sm" | "md";
};

export function Select({ className, size = "md", children, ...props }: SelectProps) {
  return (
    <div className="relative inline-flex min-w-0 items-center">
      <select
        className={cn(
          "w-full appearance-none rounded-control border border-border bg-surface text-fg",
          "pr-8 outline-none transition-colors",
          "focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-8 pl-2.5 text-xs" : "h-9 pl-3 text-xs",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 size-3.5 text-fg-faint"
      />
    </div>
  );
}
