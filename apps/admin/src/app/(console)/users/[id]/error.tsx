"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for one member's page. Rendered inside the console shell,
 * so the sidebar survives and the operator can get back to the directory.
 *
 * Next 16.3 renamed this prop from `reset` to `retry`.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] user detail error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't open this member"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
