"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ErrorReference, FullPageState } from "@/components/ui";

/**
 * ERROR LAYER 2 of 4 — the root segment boundary.
 *
 * Reached when a route has no closer `error.tsx` of its own. Prefer a segment
 * boundary: this one sits above the console shell, so the operator loses the
 * navigation and has to get back by URL.
 *
 * Next 16.3 renamed this prop: it is `retry`, not `reset`. `retry()` re-fetches
 * and re-renders the boundary's children; `reset()` (still available) only
 * clears the error state without re-fetching, which usually just throws again.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] route error", error);
  }, [error]);

  return (
    <FullPageState
      icon={AlertTriangle}
      title="This page didn't load"
      description="The console hit an unexpected error. Try again — if it persists, send the reference below to engineering."
    >
      {error.digest ? <ErrorReference digest={error.digest} className="mt-4" /> : null}
      <Button onClick={retry} className="mt-5 w-full">
        Try again
      </Button>
    </FullPageState>
  );
}
