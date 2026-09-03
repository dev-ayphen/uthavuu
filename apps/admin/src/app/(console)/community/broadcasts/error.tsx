"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/**
 * Segment boundary. Rendered inside the console shell, so the header and
 * sidebar survive and the operator can navigate away.
 *
 * Next 16.3 names this prop `retry`, not `reset` — `retry()` re-fetches and
 * re-renders the boundary's children, where `reset()` merely clears the error
 * state and usually throws again.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] broadcasts error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't load broadcasts"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
