import { Skeleton } from "@/components/ui";
import { AdminsTableSkeleton } from "@/features/admin-accounts/admins-table";

/**
 * Mirrors the loaded shape — eyebrow, title, the two count chips, then the
 * table with its real columns — so nothing jumps when the rows land.
 *
 * `AdminsTableSkeleton` is the same component the `ListStateProvider` uses as
 * its Suspense fallback, so the handover from this file to that one moves
 * nothing on screen either.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-6 w-52" />
      <Skeleton className="mt-2 h-4 w-[34rem] max-w-full" />

      <div className="mt-6 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-pill" />
          <Skeleton className="h-5 w-28 rounded-pill" />
        </div>
        <AdminsTableSkeleton />
      </div>
    </div>
  );
}
