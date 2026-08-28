"use client";

import { ErrorState } from "@/components/ui";

export default function LoginError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="grid min-h-svh place-items-center p-6">
      <ErrorState
        title="Sign-in is unavailable"
        message={error.message || "The sign-in screen failed to load."}
        digest={error.digest}
        onRetry={retry}
        className="max-w-md bg-surface"
      />
    </div>
  );
}
