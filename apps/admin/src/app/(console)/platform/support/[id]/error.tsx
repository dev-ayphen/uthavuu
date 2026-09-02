"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/**
 * Segment boundary — the console shell AND the Platform sub-menu both survive,
 * so an agent whose ticket failed to render can still get back to the queue.
 *
 * `digest` is surfaced because it is the only handle support has on the
 * matching server log; without it a report of "the ticket page broke" cannot be
 * tied to anything.
 */
export default function TicketError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] platform/support/[id] error", error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't open this ticket"
      message={error.message || "Something went wrong rendering this page."}
      digest={error.digest}
      onRetry={retry}
    />
  );
}
