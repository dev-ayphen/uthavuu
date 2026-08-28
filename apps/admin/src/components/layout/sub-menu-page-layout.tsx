"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isRouteActive } from "@/config/nav";

/**
 * Settings-shaped pages: a fixed sub-navigation beside scrolling content.
 *
 * SCROLL — Mode B (inner scroll). The sub-menu must stay put while the content
 * moves, so we bound the height and declare a scroller per pane:
 *
 *   1. The root is bounded at --app-content-height (which is
 *      calc(100svh - header)). `svh`, never `vh` — `vh` is wrong the moment
 *      mobile browser chrome is on screen.
 *   2. `min-h-0` on every flex child that scrolls. A flex child defaults to
 *      `min-height: auto`, which refuses to shrink below its content, so
 *      `overflow-y-auto` never engages, the scroll escapes to the document,
 *      and the sub-menu scrolls away with the content — the exact bug this
 *      layout exists to prevent.
 *   3. The non-scrolling pane gets `shrink-0`.
 */

export type SubMenuItem = { label: string; href: Route };

export function SubMenuPageLayout({
  title,
  subtitle,
  items,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  items: SubMenuItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-[var(--app-content-height)] flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Sub-nav: never scrolls with the content. */}
        <aside className="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-surface md:flex">
          <div className="shrink-0 border-b border-border px-4 py-3.5">
            <h2 className="truncate text-sm font-bold text-fg">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-fg-faint">{subtitle}</p> : null}
          </div>
          {/* Scrolls itself only when the list outgrows the pane. */}
          <nav className="min-h-0 flex-1 overflow-y-auto scrollbar-slim p-2">
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isRouteActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-control px-3 py-2 text-xs font-semibold transition-colors",
                        active
                          ? "bg-primary-soft text-primary-soft-fg"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* The ONLY content scroller. */}
        <div className="min-w-0 flex-1 overflow-y-auto scrollbar-slim">
          {actions ? (
            <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border bg-canvas/85 px-[var(--page-padding-inline)] py-3 backdrop-blur-md">
              {actions}
            </div>
          ) : null}
          <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
