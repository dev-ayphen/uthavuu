import { WorkbenchSkeleton } from "@/features/support-tickets/workbench-skeleton";
import { Skeleton } from "@/components/ui";

/**
 * The same skeleton `TicketWorkbench` renders for its own in-page fetch, so the
 * transition from this file to that one moves nothing on screen.
 */
export default function SegmentLoading() {
  return (
    <div className="space-y-4" aria-busy>
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-20" />
        <Skeleton className="mt-2 h-4 w-[30rem] max-w-full" />
      </div>
      <WorkbenchSkeleton />
    </div>
  );
}
