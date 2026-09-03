import { FilterRow, Skeleton } from "@/components/ui";

/**
 * What fills the `<Suspense>` boundary while `useSearchParams()` resolves.
 *
 * It mirrors the loaded shape — a filter row, then a bordered card with a
 * header band and N rows of the same height `DataTable` uses (`px-4 py-3`
 * around a `h-4` bar) — because a skeleton that does not match is worse than
 * none: the moment data lands, everything below it jumps. Same reason
 * `DataTable`'s own loading rows carry per-column widths.
 */
export function ListPageSkeleton({
  columns = 6,
  rows = 8,
  filters = 2,
}: {
  columns?: number;
  rows?: number;
  filters?: number;
}) {
  return (
    <div className="space-y-4" aria-busy>
      <FilterRow>
        <Skeleton className="h-9 w-full sm:w-64" />
        {Array.from({ length: filters }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-32" />
        ))}
      </FilterRow>

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="flex gap-4 border-b border-border bg-surface-2 px-4 py-2.5">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3 flex-1" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex gap-4 px-4 py-3">
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <Skeleton key={columnIndex} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-border px-4 py-3">
          <Skeleton className="h-8 w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}
