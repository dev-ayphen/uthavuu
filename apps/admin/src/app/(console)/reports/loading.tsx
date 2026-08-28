import { Skeleton } from "@/components/ui";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-44" />
      <div className="mt-6">
        <ListPageSkeleton columns={8} filters={3} />
      </div>
    </div>
  );
}
