import { Skeleton } from "@/components/ui";

/**
 * Mirrors the create form: the sponsor card beside the creative and placement
 * stack, then the schedule card. Matching the shape is what stops the page
 * jumping when the real form mounts.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-44" />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-4 shadow-card">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 5 }).map((_, index) => (
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

      <div className="mt-5 rounded-card border border-border bg-surface p-4 shadow-card">
        <Skeleton className="h-4 w-24" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
