"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for Audit Logs.
 *
 * Nested inside `platform/layout.tsx`, so the console shell AND the Platform
 * sub-menu both survive — the operator can step sideways to another section
 * instead of losing their place. This catches a render throw; a failed *fetch*
 * never reaches here, because `useListQuery` classifies it and the table renders
 * the right surface for it (a permission refusal is not an error).
 */
export default function AuditLogsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] platform/audit-logs error", error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't show the audit log"
      message={error.message || "Something went wrong rendering this page."}
      digest={error.digest}
      onRetry={retry}
    />
  );
}
