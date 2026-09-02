import { Skeleton } from "@/components/ui";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

/**
 * Mirrors the loaded shape — eyebrow, title, then the filter row and table —
 * so nothing jumps when the rows land. Six columns and one filter, matching
 * `UpdatesTable`.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-52" />
      <div className="mt-6">
        <ListPageSkeleton columns={6} filters={1} />
      </div>
    </div>
  );
}
