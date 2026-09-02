import { Skeleton } from "@/components/ui";
import { DashboardSkeleton } from "@/features/dashboard/dashboard-skeleton";

/**
 * Segment loading. Rendered before `page.tsx` exists on the client, so it also
 * stands in for PageLayout's sticky header — hence the two bars up top, which
 * match the title and subtitle rather than the content below them.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
