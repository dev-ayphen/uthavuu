"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for Impact Stories.
 *
 * It sits on the segment rather than relying on `(console)/community/error.tsx`
 * so the console shell — header, sidebar, sub-nav — survives the throw and the
 * operator can navigate away instead of being stranded. Next 16.3 renamed
 * `reset` to `retry`.
 *
 * `digest` is always surfaced: it is the only handle support has to find the
 * matching server log line.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] impact stories error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't load impact stories"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
