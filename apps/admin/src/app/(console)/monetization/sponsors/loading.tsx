import { Skeleton } from "@/components/ui";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

/**
 * Mirrors the loaded shape — eyebrow, title, then the status tabs, the search
 * row and the table — so nothing jumps when the rows land. Six columns and no
 * dropdown filters, matching `SponsorsTable` (status is the tab strip above).
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-40" />

      <div className="mt-6 space-y-4">
        {/* The status tab strip. */}
        <Skeleton className="h-11 w-full max-w-xl rounded-control" />
        <ListPageSkeleton columns={6} filters={0} />
      </div>
    </div>
  );
}
