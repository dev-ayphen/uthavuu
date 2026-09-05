"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for the photo queue. Next 16.3 renamed `reset` to `retry`.
 *
 * Segment-level rather than relying on the console's root boundary: the shell
 * survives, so a moderator whose queue failed can still reach the rest of the
 * console instead of losing the sidebar. `digest` is surfaced because it is the
 * only handle that ties this screen to the matching server log.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] photo verification queue error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't load the photo queue"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
