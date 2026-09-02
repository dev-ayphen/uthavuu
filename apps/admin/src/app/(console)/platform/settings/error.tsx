"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/**
 * Segment boundary — the console shell and the Platform sub-menu both survive,
 * so an operator can navigate away instead of being left on a white page.
 *
 * Next 16.3 names this prop `retry`, not `reset`: `retry()` re-fetches and
 * re-renders the boundary's children, where `reset()` merely clears the error
 * state and usually throws again.
 *
 * `digest` is surfaced because it is the only handle support has to find the
 * matching server log line.
 */
export default function SettingsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] platform/settings error", error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't show app settings"
      message={
        error.message ||
        "Something went wrong rendering this page. No setting has been changed."
      }
      digest={error.digest}
      onRetry={retry}
    />
  );
}
