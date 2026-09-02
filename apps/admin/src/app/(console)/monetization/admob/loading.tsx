import { Skeleton } from "@/components/ui";

/**
 * Mirrors the loaded shape — eyebrow, title, subtitle, the status strip, then
 * the three cards — so nothing jumps when the page resolves. The page awaits
 * `getAdminSession()` before it renders anything, which is the gap this fills.
 */
export default function SegmentLoading() {
  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-6 w-44" />
      <Skeleton className="mt-2 h-4 w-full max-w-2xl" />

      <div className="mt-6 space-y-6">
        {/* Status strip: badge + the "checked on" line beside it. */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-32 rounded-pill" />
          <Skeleton className="h-3 w-72" />
        </div>

        {/* How AdMob money works — four numbered steps and a footer action. */}
        <Skeleton className="h-80 rounded-card" />
        {/* What is in place today — three tiles across. */}
        <Skeleton className="h-64 rounded-card" />
        {/* Ad placements and formats. */}
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}
