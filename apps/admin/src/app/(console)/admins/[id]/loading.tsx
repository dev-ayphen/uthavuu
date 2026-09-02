import { Card, Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded detail: the back link, name, email, badges and the
 * six-field card. `AdminDetail` renders `DetailSkeleton fields={6}` for its own
 * in-page fetch, so this file and that one line up and the handover between
 * them moves nothing on screen.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]" aria-busy>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-6 w-40" />

      <div className="mt-6 space-y-6">
        <div>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2 h-6 w-56" />
          <Skeleton className="mt-2 h-4 w-64" />
          <div className="mt-2 flex gap-1.5">
            <Skeleton className="h-4 w-20 rounded-pill" />
            <Skeleton className="h-4 w-16 rounded-pill" />
          </div>
        </div>

        <Card>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="mt-2 h-4 w-36" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
