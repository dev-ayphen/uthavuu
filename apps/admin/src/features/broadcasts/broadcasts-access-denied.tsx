import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui";

/**
 * What an ops admin sees on this section.
 *
 * Rendered as an EmptyState, NOT an ErrorState — the same call
 * `src/app/(console)/admins/page.tsx` and `UpdatesAccessDenied` make, for the
 * same reason. A red "something went wrong" over a correctly-enforced
 * permission invites an operator to file a bug against the system working as
 * designed, and it hides the one useful next step, which is knowing who to ask.
 */
export function BroadcastsAccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title="Only super admins can send broadcasts"
      description="Your role covers moderation — reports, comments and accounts. Pushing a notification to citizens' phones is irreversible and reaches people who never asked for it, so it sits behind a platform permission. Ask a super admin if you need this."
    />
  );
}
