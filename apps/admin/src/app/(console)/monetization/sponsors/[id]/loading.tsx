import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded editor: the meta strip, the not-tracked note, the two
 * editor columns and the schedule card. `SponsorEditor` renders the same shape
 * again for its own in-page fetch, so the transition from this file to that one
 * moves nothing on screen.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-32" />

      <div className="mt-6 rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="mt-5 h-12 w-full rounded-card" />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-4 shadow-card">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="mt-4 h-3 w-16" />
              <Skeleton className="mt-2 h-11 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-5">
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-4 h-11 w-full" />
          </div>
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
