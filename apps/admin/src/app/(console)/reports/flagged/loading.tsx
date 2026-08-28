import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ListPageSkeleton columns={8} filters={1} />
    </div>
  );
}
