"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for one held photo. Next 16.3 renamed `reset` to `retry`.
 *
 * Segment-level so the console shell survives: a moderator whose photo failed
 * to open can still get back to the queue. `digest` is the only handle tying
 * this screen to the matching server log, so it is always surfaced.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] photo verification detail error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't open this photo"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
