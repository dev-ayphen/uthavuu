"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui";

/**
 * Segment boundary for the AdMob page.
 *
 * Its own file rather than inheriting `../error.tsx` so a failure here says
 * which page failed, and so a fault on this page cannot take the Monetization
 * Overview's boundary with it. Rendered inside the console shell, so the header
 * and sidebar survive and the operator can navigate away.
 *
 * `digest` is always surfaced: it is the only handle support has to find the
 * matching server log line.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] monetization/admob error", error);
  }, [error]);

  return (
    <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
      <ErrorState
        title="Couldn't load the AdMob page"
        message={
          error.message ||
          "The console couldn't resolve your session, so it stopped rather than guess what you're allowed to see."
        }
        digest={error.digest}
        onRetry={retry}
      />
    </div>
  );
}
