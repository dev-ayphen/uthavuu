"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/** Segment boundary — the console shell and the Platform sub-menu both survive. */
export default function SystemHealthError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] platform/system-health error", error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't show system health"
      message={error.message || "Something went wrong rendering this page."}
      digest={error.digest}
      onRetry={retry}
    />
  );
}
