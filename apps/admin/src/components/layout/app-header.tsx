"use client";

import { Menu } from "lucide-react";

import { Badge, ThemeToggle, UthavuLogoTile } from "@/components/ui";
import { SITE } from "@/config/site";
import { SignOutButton } from "./sign-out-button";
import { cn } from "@/lib/cn";
import { isSuperAdmin, type AdminRoleRef } from "@/lib/roles";
import { useSidebar } from "./sidebar-state";

export type HeaderSession = { name: string; role: AdminRoleRef } | null;

/**
 * The console's fixed top bar.
 *
 * `position: fixed` is deliberate — the header is chrome, so it is out of flow
 * and cannot scroll away with the content. AppLayout reserves its height with
 * padding on the content area, never a margin.
 */
export function AppHeader({ session }: { session: HeaderSession }) {
  const { setMobileOpen, mobileOpen } = useSidebar();

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-[var(--layout-header-height)]",
        "flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-md",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <UthavuLogoTile />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-extrabold tracking-tight text-fg">
              {SITE.name}{" "}
              <span className="font-bold text-primary">({SITE.wordmarkTamil})</span>
            </span>
            {session ? (
              /* The label comes straight from the API (`role.label`). The key
                 only picks the tone, so a role this build has never heard of
                 still renders correctly instead of looking signed out. */
              <Badge tone={isSuperAdmin(session.role) ? "primary" : "warning"}>
                {session.role.label}
              </Badge>
            ) : (
              <Badge tone="neutral">Signed out</Badge>
            )}
          </div>
          <p className="hidden truncate text-[11px] text-fg-subtle sm:block">{SITE.tagline}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-2 rounded-control border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] md:flex">
          <span className="size-1.5 animate-pulse rounded-pill bg-success-fg" aria-hidden />
          <span className="text-fg-subtle">System operational</span>
        </div>

        <ThemeToggle />

        <SignOutButton />
      </div>
    </header>
  );
}
