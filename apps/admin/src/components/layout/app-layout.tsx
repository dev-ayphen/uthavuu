"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AppHeader, type HeaderSession } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-state";

/**
 * The console shell: fixed top bar + fixed left sidebar + content area.
 *
 * SCROLL OWNERSHIP — the rule the whole shell is built around:
 *
 *   Chrome NEVER scrolls with content.
 *
 * Both the header and the sidebar are `position: fixed`, which takes them out
 * of flow so they physically cannot scroll. The content area then reserves
 * their space with PADDING, never margin — a margin would move the content box
 * itself and break the sticky page header's offset math.
 *
 * Every dimension involved is a token (--layout-header-height,
 * --layout-sidebar-width). The padding here and the `--app-content-height`
 * used by the Mode B layouts are both derived from them, so they cannot drift.
 *
 * Desktop-first, per the App Profile: the sidebar is persistent from `lg` up
 * and becomes an off-canvas drawer below it.
 *
 * `permissions` is passed alongside `session` rather than folded into it. The
 * header renders identity (name, role label) and the sidebar renders
 * capability, and they are not the same question: the role LABEL is display
 * text the API authors, while the permission LIST is what the database granted.
 * Deriving one from the other is exactly the role -> section map
 * `apps/api/src/admin/admin-rbac.ts:5-8` warns against.
 */
export function AppLayout({
  session,
  permissions,
  children,
}: {
  session: HeaderSession;
  /** From `GET /admin/me`. Drives which nav entries render — UX only, the API enforces. */
  permissions: readonly string[];
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppHeader session={session} />
      <AppSidebar permissions={permissions} />
      <ContentArea>{children}</ContentArea>
    </SidebarProvider>
  );
}

function ContentArea({ children }: { children: ReactNode }) {
  const { collapsed, hydrated } = useSidebar();

  return (
    <main
      className={cn(
        "min-h-svh pt-[var(--layout-header-height)]",
        collapsed
          ? "lg:pl-[var(--layout-sidebar-width-collapsed)]"
          : "lg:pl-[var(--layout-sidebar-width)]",
        hydrated && "transition-[padding] duration-200",
      )}
    >
      {children}
    </main>
  );
}
