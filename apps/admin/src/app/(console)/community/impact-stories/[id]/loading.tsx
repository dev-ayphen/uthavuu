import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded detail: header, the before/after pair, the three metric
 * tiles, then the fields card. Matching the real shape is the point — a
 * skeleton that doesn't match causes the page to jump the moment data lands,
 * which is worse than no skeleton.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-80" />
      <Skeleton className="mt-2 h-4 w-96" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Skeleton className="aspect-[3/2] w-full rounded-card" />
        <Skeleton className="aspect-[3/2] w-full rounded-card" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>

      <Skeleton className="mt-6 h-64 rounded-card" />
    </div>
  );
}
