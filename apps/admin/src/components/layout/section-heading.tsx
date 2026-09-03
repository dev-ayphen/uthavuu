import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The heading for a page nested inside `SubMenuPageLayout`.
 *
 * WHY THESE PAGES DON'T JUST USE `PageLayout`
 * ───────────────────────────────────────────────────────────────────────────
 * Everything under `/platform` shares one frame — `platform/layout.tsx` renders
 * `SubMenuPageLayout`, which already owns the breadcrumb, the `<h1>`, the
 * container width and the sub-nav. A second `PageLayout` inside it would draw a
 * second sticky header and a second `<h1>`, which is both a visual duplicate
 * and an outline with two top-level headings.
 *
 * So each sub-page owns only its own title, and all six of them were writing
 * the same two elements by hand — `"text-lg font-extrabold tracking-tight
 * text-fg"` over `"mt-0.5 text-fg-subtle"`. They are `<h2>` because the layout
 * above already spent the `<h1>`.
 *
 * `actions` matters for the same reason `PageLayout` has one: without a slot,
 * a page needing a button beside its title reaches for its own flex row and the
 * baseline stops matching the five pages that didn't.
 */
export function SectionHeading({
  title,
  description,
  actions,
  /** Rendered above the title — a back link on a nested detail page. */
  above,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  above?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {above ? <div className="mb-2">{above}</div> : null}
        <h2 className="text-lg font-extrabold tracking-tight text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-fg-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
