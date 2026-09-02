"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for one admin account. Rendered inside the console shell, so
 * the header and sidebar survive and the operator can get back to the list.
 *
 * Next 16.3 names this prop `retry`, not `reset` — `retry()` re-fetches and
 * re-renders the boundary's children, where `reset()` merely cleared the error
 * state and usually threw again.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The message only. A failure on this page can be a rejected credential
    // change, and the error object is the last place a password should be able
    // to reach a log.
    console.error("[admin] admin account detail error", error.message, error.digest);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't open this admin account"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
