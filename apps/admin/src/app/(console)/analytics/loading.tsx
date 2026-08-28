import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded analytics layout — four stat cards, six metric tiles, a
 * 2:1 chart row and a 1:1 panel row — so the page does not reflow when the
 * figures arrive.
 */
export default function Loading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <div className="mx-auto w-full max-w-[var(--container-wide)] space-y-4">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-card" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[4.75rem] rounded-card" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-card lg:col-span-2" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      </div>
    </div>
  );
}
