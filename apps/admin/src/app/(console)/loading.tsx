import { Skeleton } from "@/components/ui";

/**
 * The shell's default loading state. It mirrors the shape of a typical console
 * page — header block, then a content grid — so nothing jumps when data lands.
 */
export default function ConsoleLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
    </div>
  );
}
