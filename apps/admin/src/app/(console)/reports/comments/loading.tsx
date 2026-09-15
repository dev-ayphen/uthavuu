import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export default function SegmentLoading() {
  return (
    <div className="px-(--page-padding-inline) py-(--page-padding-block)">
      <ListPageSkeleton columns={6} filters={2} />
    </div>
  );
}
