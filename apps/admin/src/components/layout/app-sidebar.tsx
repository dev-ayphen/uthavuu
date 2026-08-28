"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { CountBadge } from "@/components/ui";
import {
  NAV_SECTIONS,
  findActiveChildHref,
  findActiveSection,
  isRouteActive,
  type NavSection,
} from "@/config/nav";
import { useNavBadges, type NavBadges } from "@/config/nav-badges";
import { cn } from "@/lib/cn";
import { useSidebar } from "./sidebar-state";

/**
 * The console's primary navigation.
 *
 * SCROLL: the sidebar is `position: fixed` in AppLayout, so it is out of flow
 * and cannot scroll away with the content. Its own nav list scrolls internally
 * when it outgrows the viewport — which needs `min-h-0` on the scrolling flex
 * child, or the overflow escapes to the document and takes the whole sidebar
 * with it.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const badges = useNavBadges();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen, hydrated } = useSidebar();

  const activeSection = findActiveSection(pathname);

  // Which group is expanded. The operator can toggle it, but moving to a new
  // section re-seeds it so the section you are in is always open.
  //
  // That re-seed is done by ADJUSTING STATE DURING RENDER, not in an effect.
  // React handles this in the same pass with no extra paint, whereas an effect
  // would render the wrong group open and then correct it a frame later.
  const [expandedKey, setExpandedKey] = useState<string | null>(activeSection?.key ?? null);
  const [seededFor, setSeededFor] = useState<string | undefined>(activeSection?.key);
  if (activeSection?.key !== seededFor) {
    setSeededFor(activeSection?.key);
    setExpandedKey(activeSection?.children ? activeSection.key : null);
  }

  // A navigation should dismiss the mobile drawer, otherwise it covers the
  // page the operator just asked for. This is a genuine effect: it reacts to
  // navigation, an event outside React's control.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      {/* Drawer scrim, below `lg` only. */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-overlay backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        data-collapsed={collapsed}
        className={cn(
          // Fixed chrome: out of flow, so it never scrolls with the content.
          "fixed bottom-0 left-0 top-[var(--layout-header-height)] z-40",
          "flex flex-col overflow-hidden border-r border-border bg-surface",
          collapsed
            ? "w-[var(--layout-sidebar-width-collapsed)]"
            : "w-[var(--layout-sidebar-width)]",
          hydrated && "transition-[width,transform] duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-3 pt-3 pb-1">
          {!collapsed ? <span className="micro-label px-1">Menu</span> : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden size-7 items-center justify-center rounded-control text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg lg:flex",
              collapsed && "mx-auto",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        {/* min-h-0 is load-bearing: without it this never scrolls and the
            overflow escapes to the document. */}
        <nav
          aria-label="Main"
          className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-2 pb-3"
        >
          <ul className="space-y-0.5">
            {NAV_SECTIONS.map((section) => (
              <li key={section.key}>
                <SectionItem
                  section={section}
                  pathname={pathname}
                  badges={badges}
                  collapsed={collapsed}
                  isActive={activeSection?.key === section.key}
                  isExpanded={expandedKey === section.key}
                  onToggle={() =>
                    setExpandedKey((prev) => (prev === section.key ? null : section.key))
                  }
                />
              </li>
            ))}
          </ul>
        </nav>

        {!collapsed ? (
          <div className="shrink-0 border-t border-border p-3">
            <div className="rounded-control border border-border bg-surface-inset p-3">
              <p className="text-[11px] font-bold text-fg">System status</p>
              <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-success-fg">
                <span className="size-1.5 rounded-pill bg-success-fg" aria-hidden />
                API reachable
              </p>
              <p className="mt-1 text-[10px] text-fg-faint">Chennai region</p>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}

function SectionItem({
  section,
  pathname,
  badges,
  collapsed,
  isActive,
  isExpanded,
  onToggle,
}: {
  section: NavSection;
  pathname: string;
  badges: NavBadges;
  collapsed: boolean;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;
  const badge = section.badgeKey ? badges[section.badgeKey] : undefined;
  const hasChildren = Boolean(section.children?.length);
  const activeChildHref = hasChildren ? findActiveChildHref(section, pathname) : undefined;

  const rowClass = cn(
    "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-xs font-semibold transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    isActive
      ? "bg-primary-soft text-primary-soft-fg"
      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
    collapsed && "justify-center px-0",
  );

  const iconEl = (
    <Icon className={cn("size-4 shrink-0", isActive ? "text-primary-soft-fg" : "text-fg-faint")} />
  );

  // Collapsed rail: icons only, and groups do not expand inline — there is no
  // room for a label, so a flyout would be the only honest affordance and that
  // is not built yet. The section's landing route is still one click away.
  if (collapsed) {
    return (
      <Link
        href={section.href}
        title={section.label}
        aria-label={section.label}
        aria-current={isActive ? "page" : undefined}
        className={rowClass}
      >
        <span className="relative">
          {iconEl}
          {badge ? (
            <span
              className="absolute -right-1.5 -top-1.5 size-1.5 rounded-pill bg-danger-fg"
              aria-hidden
            />
          ) : null}
        </span>
      </Link>
    );
  }

  if (!hasChildren) {
    return (
      <Link
        href={section.href}
        aria-current={isActive ? "page" : undefined}
        className={rowClass}
      >
        {iconEl}
        <span className="flex-1 truncate text-left">{section.label}</span>
        {badge ? <CountBadge count={badge} /> : null}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(rowClass, isActive && !activeChildHref && "bg-primary-soft")}
      >
        {iconEl}
        <span className="flex-1 truncate text-left">{section.label}</span>
        {badge ? <CountBadge count={badge} /> : null}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-fg-faint transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
          aria-hidden
        />
      </button>

      {isExpanded ? (
        <ul className="mt-0.5 mb-1 ml-4 space-y-0.5 border-l-2 border-primary-soft-border pl-2.5">
          {section.children?.map((child) => {
            const childActive = child.href === activeChildHref;
            const childBadge = child.badgeKey ? badges[child.badgeKey] : undefined;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-control px-2.5 py-1.5 text-[11px] font-medium transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    childActive
                      ? "bg-primary-soft font-semibold text-primary-soft-fg"
                      : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span className="flex-1 truncate">{child.label}</span>
                  {childBadge ? <CountBadge count={childBadge} /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

export { isRouteActive };
