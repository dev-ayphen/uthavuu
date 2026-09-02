"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * Segment boundary. Rendered inside the console shell, so the header and
 * sidebar survive and the operator can navigate away.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The message and digest only, never the error object. Password changes are
    // initiated from this segment, and an error object can carry the request
    // that produced it in its cause chain on some runtimes — a log line is the
    // last place a credential should be able to reach.
    console.error("[admin] admins error", error.message, error.digest);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't load admin accounts"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
