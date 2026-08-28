import { Skeleton } from "@/components/ui";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

/**
 * Mirrors the loaded page: sticky header band, then the filter row and table
 * that `UsersTable` renders. A skeleton whose shape differs from the real thing
 * is worse than none — everything jumps the moment data lands.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-6 w-32" />
      <div className="mt-6">
        <ListPageSkeleton columns={7} filters={3} />
      </div>
    </div>
  );
}
