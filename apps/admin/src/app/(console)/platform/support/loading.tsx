import { Skeleton } from "@/components/ui";

/** Mirrors the loaded shape: heading, status tabs, filter row, table. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-4 w-[34rem] max-w-full" />
      </div>

      {/* The status tab strip — six tabs above a hairline, as StatusTabs renders. */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-control" />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40" />
      </div>

      <Skeleton className="h-[26rem] rounded-card" />
    </div>
  );
}
