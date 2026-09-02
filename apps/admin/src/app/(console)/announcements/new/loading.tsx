import { Skeleton } from "@/components/ui";

/**
 * Mirrors the create form: two editor cards side by side, then the schedule
 * card and the action bar. Matching the shape is what stops the page jumping
 * when the real form mounts.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-44" />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="mt-2 h-48 w-full" />
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-card border border-border bg-surface p-4 shadow-card">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
