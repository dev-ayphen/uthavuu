"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";
import { PageLayout } from "@/components/layout/page-layout";

/**
 * ERROR LAYER 1 of 4 — the preferred boundary.
 *
 * This sits INSIDE `(console)/layout.tsx`, because `error.tsx` wraps a
 * segment's page and nested children but never the layout of its own segment.
 * That is exactly what we want: the shell survives, the header and sidebar
 * keep rendering, and the operator can navigate somewhere else instead of
 * being stranded on a full-page error.
 *
 * Sections that fetch their own data should add their own `error.tsx` so the
 * failure lands as close to the cause as possible. This is the backstop.
 */
export default function ConsoleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] console segment error", error);
  }, [error]);

  return (
    <PageLayout title="Something went wrong" subtitle="This section failed to load.">
      <ErrorState
        title="Couldn't load this section"
        message={error.message || "The console couldn't reach the data it needed."}
        digest={error.digest}
        onRetry={retry}
      />
    </PageLayout>
  );
}
