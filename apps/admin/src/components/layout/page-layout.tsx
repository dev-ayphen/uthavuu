import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * THE LAYOUT CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 * A `page.tsx` never sets its own `max-w-*`, `mx-auto`, or page padding. It
 * composes a layout primitive, passes `contentWidth`, and renders content.
 * If a page is reaching for `max-w-2xl mx-auto`, the contract has been
 * bypassed and two things now own the same measurement.
 *
 * SCROLL — Mode A (document scroll).
 * AppLayout's chrome is `position: fixed`, so it is out of flow and cannot
 * scroll. The content area reserves that space with PADDING, never margin.
 * The page header below sticks under the fixed app header using the
 * --page-header-sticky-offset token, which is derived from the header height —
 * so the two can never drift apart.
 */

export type ContentWidth = "narrow" | "default" | "wide";

const CONTENT_WIDTH: Record<ContentWidth, string> = {
  narrow: "max-w-[var(--container-narrow)]",
  default: "max-w-[var(--container-default)]",
  wide: "max-w-[var(--container-wide)]",
};

export type Crumb = { label: string; href?: Route };

export type PageLayoutProps = {
  title: string;
  /** Small uppercase kicker above the title. Use it to name the section. */
  eyebrow?: string;
  subtitle?: string;
  breadcrumb?: Crumb[];
  /** Right-aligned controls in the sticky page header. */
  actions?: ReactNode;
  contentWidth?: ContentWidth;
  children: ReactNode;
};

export function PageLayout({
  title,
  eyebrow,
  subtitle,
  breadcrumb,
  actions,
  contentWidth = "default",
  children,
}: PageLayoutProps) {
  const width = CONTENT_WIDTH[contentWidth];

  return (
    <>
      <header
        className={cn(
          "sticky top-[var(--page-header-sticky-offset)] z-30",
          "border-b border-border bg-canvas/85 backdrop-blur-md",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-3",
            "px-[var(--page-padding-inline)] py-3.5",
            width,
          )}
        >
          <div className="min-w-0">
            {breadcrumb?.length ? <Breadcrumb items={breadcrumb} /> : null}
            {eyebrow ? <p className="micro-label mb-1">{eyebrow}</p> : null}
            <h1 className="truncate text-xl font-extrabold tracking-tight text-fg">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-fg-subtle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <div
        className={cn(
          "mx-auto w-full px-[var(--page-padding-inline)] py-[var(--page-padding-block)]",
          width,
        )}
      >
        {children}
      </div>
    </>
  );
}

function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] text-fg-faint">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3 text-fg-faint" aria-hidden /> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="rounded-sm transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-fg-muted">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
