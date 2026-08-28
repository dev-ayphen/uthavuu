"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/** Segment boundary — the console shell and the Platform sub-menu both survive. */
export default function CategoriesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] platform/categories error", error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't show the categories"
      message={error.message || "Something went wrong rendering this page."}
      digest={error.digest}
      onRetry={retry}
    />
  );
}
