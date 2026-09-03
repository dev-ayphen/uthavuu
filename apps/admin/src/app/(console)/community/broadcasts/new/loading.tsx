import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded compose form: two side-by-side language cards, then the
 * audience and schedule cards and the action bar. The form itself is rendered
 * synchronously with empty defaults, so this is only ever on screen while the
 * permission check resolves.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-48" />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="mt-2 h-44 w-full" />
          </div>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="mt-5 rounded-card border border-border bg-surface p-4 shadow-card"
        >
          <Skeleton className="h-4 w-32" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
