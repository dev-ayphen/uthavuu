import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { SessionDenial } from "@/lib/session";

/**
 * Shown when the console cannot admit someone but sending them to /login would
 * be wrong or useless. Deliberately says which of the two happened: "you are
 * signed in but not staff" and "the API is unreachable" need different actions,
 * and a single generic message would make an outage look like a permissions
 * problem to the one person able to tell the difference.
 */
export function AccessDenied({ denial }: { denial: Exclude<SessionDenial, "signed-out"> }) {
  const copy =
    denial === "not-admin"
      ? {
          title: "You don't have console access",
          body: "This account is signed in, but it isn't a staff account. Ask a super admin to grant you access, then sign in again.",
        }
      : {
          title: "Can't reach the API",
          body: "The console signed you in, but the API didn't answer. It may be restarting. This isn't a problem with your account.",
        };

  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-fg text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-fg-muted mt-3 text-sm leading-relaxed">{copy.body}</p>
        <div className="mt-8 flex justify-center gap-3">
          {/* A retry is the useful action for an outage; signing out is the
              useful one for the wrong account. Both are offered either way —
              guessing wrong would strand someone with no way forward. */}
          <Button asChild variant="secondary">
            <Link href="/dashboard">Try again</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">Sign in as someone else</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
