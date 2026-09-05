import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded shape — header, the photograph, then the three panels — so
 * the page does not jump when the record lands.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-2 h-6 w-80" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Skeleton className="mt-6 h-80 rounded-card" />
      <Skeleton className="mt-6 h-48 rounded-card" />
      <Skeleton className="mt-4 h-48 rounded-card" />
    </div>
  );
}
