import { Skeleton } from "@/components/ui";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

/**
 * Mirrors the loaded shape — three summary cards, then the filter row and
 * table — so nothing jumps the moment the data lands.
 */
export default function SegmentLoading() {
  return (
    <div className="space-y-4 px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-card" />
        ))}
      </div>
      <ListPageSkeleton columns={8} filters={5} />
    </div>
  );
}
