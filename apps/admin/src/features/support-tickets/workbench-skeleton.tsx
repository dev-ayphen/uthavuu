import { Skeleton } from "@/components/ui";

/**
 * The workbench's loading shape.
 *
 * MIRRORS THE LOADED LAYOUT, not a generic box: the same meta strip, the same
 * two-column split at the same breakpoint, the same alternating conversation
 * lanes, the same composer height and the same two right-hand cards. A skeleton
 * that does not match the loaded shape causes layout shift the moment data
 * lands, which is worse than no skeleton — the agent's eye has already gone to
 * where the reply box was.
 *
 * Exported so the route's `loading.tsx` and the in-page fetch render the SAME
 * fallback. Two skeletons for one screen drift, and the transition from the
 * route's to the component's would visibly move things on screen for no reason.
 */
export function WorkbenchSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      {/* Meta strip — six fields, three columns, as DetailFields renders them. */}
      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-4 w-28" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          {/* The thread, alternating sides — the opening message and two
              replies, which is roughly what a real ticket looks like. */}
          {[
            { side: "left", height: "h-20" },
            { side: "right", height: "h-16" },
            { side: "left", height: "h-14" },
          ].map((row, index) => (
            <div key={index} className={row.side === "right" ? "flex justify-end" : "flex"}>
              <div className="w-full max-w-[46rem]">
                <Skeleton className="h-2.5 w-40" />
                <Skeleton className={`mt-1 w-full rounded-card ${row.height}`} />
              </div>
            </div>
          ))}

          {/* The composer: mode switch, audience banner, box, button. */}
          <div className="rounded-card border border-border bg-surface p-3 shadow-card">
            <Skeleton className="h-8 w-56 rounded-control" />
            <Skeleton className="mt-3 h-9 w-full rounded-control" />
            <Skeleton className="mt-3 h-24 w-full rounded-control" />
            <div className="mt-3 flex justify-end">
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Handling: three fields and the action row. */}
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="mt-4">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="mt-2 h-9 w-full rounded-control" />
              </div>
            ))}
            <div className="mt-4 flex gap-2 border-t border-border pt-4">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>

          {/* Raised by: person, phone, account status. */}
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-4 h-6 w-40" />
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="mt-3">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="mt-2 h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
