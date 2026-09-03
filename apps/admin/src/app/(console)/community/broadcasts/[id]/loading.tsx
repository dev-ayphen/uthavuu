import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded editor: the meta strip, two side-by-side language cards,
 * the audience/schedule cards and the action bar. `BroadcastEditor` renders the
 * same shape again for its own in-page fetch, so the transition from this file
 * to that one moves nothing on screen.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-36" />

      <div className="mt-6 rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
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
    </div>
  );
}
