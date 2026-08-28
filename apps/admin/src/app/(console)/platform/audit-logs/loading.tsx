import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded page: heading, filter row, then a table-shaped block.
 * A skeleton that does not match the loaded shape causes the layout shift it
 * was added to prevent.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-[32rem] max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Keyed by index, not by width: the filter row has two same-width
            date pickers, and using the width as the key collides. */}
        {["14rem", "10rem", "9rem", "9rem"].map((width, index) => (
          <Skeleton key={index} className="h-8" style={{ width }} />
        ))}
      </div>
      <Skeleton className="h-[26rem] rounded-card" />
    </div>
  );
}
