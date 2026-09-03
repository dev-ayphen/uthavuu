"use client";

import type { Route } from "next";
import { MousePointerSquareDashed } from "lucide-react";
import type { ReactNode } from "react";

import { BackButton, Card, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The right-hand half of a list -> detail flow.
 *
 * Works both as a pane inside `SelectionPanelLayout` and as the body of a
 * standalone `/users/[id]` page, because the same record gets looked at both
 * ways: skimmed while working a queue, and opened directly from a link in a
 * ticket. Only the frame differs, so only the frame is the layout's business.
 */

export function DetailHeader({
  title,
  eyebrow,
  subtitle,
  badges,
  actions,
  backHref,
  backLabel = "Back",
  className,
}: {
  title: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  /** Shown only in the standalone-page case; a pane already has its list. */
  backHref?: Route;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {backHref ? (
          <div className="mb-2.5">
            <BackButton href={backHref} label={backLabel} />
          </div>
        ) : null}
        {eyebrow ? <p className="micro-label mb-1">{eyebrow}</p> : null}
        <h2 className="truncate text-lg font-extrabold tracking-tight text-fg">{title}</h2>
        {subtitle ? <div className="mt-0.5 text-fg-subtle">{subtitle}</div> : null}
        {badges ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DetailSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-sm font-bold text-fg">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-fg-faint">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Label/value pairs as a real `<dl>`.
 *
 * A grid of divs looks identical and tells a screen reader nothing about which
 * label owns which value — which is the entire content of a detail view.
 */
export function DetailFields({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <Card>
      <dl
        className={cn(
          "grid gap-x-6 gap-y-4 p-4",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-1 sm:grid-cols-2",
          columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          className,
        )}
      >
        {children}
      </dl>
    </Card>
  );
}

export function DetailField({
  label,
  children,
  span = 1,
}: {
  label: string;
  children: ReactNode;
  /** Widen for long values — a comment body, an address. */
  span?: 1 | 2 | 3;
}) {
  return (
    <div className={cn("min-w-0", span === 2 && "sm:col-span-2", span === 3 && "sm:col-span-3")}>
      <dt className="micro-label">{label}</dt>
      <dd className="mt-1 min-w-0 text-fg">{children}</dd>
    </div>
  );
}

/**
 * The right pane before anything is picked.
 *
 * Not an error and not a loading state — a prompt. Leaving it blank makes a
 * two-pane layout look half-broken on arrival.
 */
export function DetailEmpty({
  title = "Nothing selected",
  description = "Pick a row from the list to see its details here.",
  icon,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-fg-faint">
        {icon ?? <MousePointerSquareDashed className="size-10" aria-hidden />}
      </div>
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-fg-subtle">{description}</p>
    </div>
  );
}

/** Mirrors DetailHeader + DetailFields, so nothing shifts when the record lands. */
export function DetailSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Card>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-4 w-36" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Vertical rhythm for a detail body. Sets no width or padding — the layout owns those. */
export function DetailBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}
