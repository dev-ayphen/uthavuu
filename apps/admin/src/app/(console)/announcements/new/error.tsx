"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/** Segment boundary — the console shell survives, so the operator can navigate away. */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] new announcement error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't open the editor"
        message={error.message || "The console hit an unexpected error before the form loaded."}
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
