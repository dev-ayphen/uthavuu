"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

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
    <div className="grid min-h-svh place-items-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6 shadow-raised">
        <div className="flex size-10 items-center justify-center rounded-control bg-danger-soft text-danger-fg">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="mt-4 text-base font-bold text-fg">This page didn&apos;t load</h1>
        <p className="mt-1.5 text-fg-subtle">
          The console hit an unexpected error. Try again — if it persists, send the reference
          below to engineering.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-fg-faint">
            Reference: <span className="text-fg-muted">{error.digest}</span>
          </p>
        ) : null}
        <Button onClick={retry} className="mt-5 w-full">
          Try again
        </Button>
      </div>
    </div>
  );
}
