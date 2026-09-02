import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Mirrors the loaded shape — the "last changed" strip, three cards with their
 * real field counts, and the maintenance card. A skeleton that does not match
 * causes a layout shift the moment the data lands, which is worse than showing
 * nothing.
 *
 * Shared by `settings-view.tsx` (the query's pending state) and the route's
 * `loading.tsx` (the segment's), so the two cannot drift apart.
 */
export function SettingsSkeleton() {
  return (
    <div className="max-w-[var(--container-default)] space-y-5" aria-busy>
      <div className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-8 w-24" />
      </div>

      {/* General: two rows of fields. */}
      <CardSkeleton titleWidth="w-20" rows={2} />
      {/* Reports: two numbers, the radius chips, one switch. */}
      <CardSkeleton titleWidth="w-24" rows={2} chips switches={1} />
      {/* Community: two switches. */}
      <CardSkeleton titleWidth="w-28" rows={0} switches={2} />
      {/* Maintenance. */}
      <CardSkeleton titleWidth="w-32" rows={0} switches={2} />
    </div>
  );
}

function CardSkeleton({
  titleWidth,
  rows,
  chips = false,
  switches = 0,
}: {
  /** A Tailwind width class — the repo's other skeletons size the same way. */
  titleWidth: string;
  rows: number;
  chips?: boolean;
  switches?: number;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      <Skeleton className={cn("h-4", titleWidth)} />

      {rows > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: rows * 2 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-11 w-full" />
            </div>
          ))}
        </div>
      ) : null}

      {chips ? (
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-16 rounded-pill" />
          ))}
        </div>
      ) : null}

      {switches > 0 ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: switches }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-control" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
