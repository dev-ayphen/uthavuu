import { Skeleton } from "@/components/ui";
import { StoriesTableSkeleton } from "@/features/impact-stories/stories-table";

/**
 * Mirrors the loaded shape — an eyebrow, a title, a subtitle, then the filter
 * row and the table at their real widths — so nothing shifts when the segment
 * resolves. It reuses the table's own skeleton for exactly that reason: two
 * hand-written skeletons drift apart the first time a column changes.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-52" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-6">
        <StoriesTableSkeleton />
      </div>
    </div>
  );
}
