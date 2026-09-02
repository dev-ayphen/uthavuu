import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui";

/**
 * What an ops admin sees on this section.
 *
 * Rendered as an EmptyState, NOT an ErrorState — the same call
 * `src/app/(console)/admins/page.tsx` makes for the same reason. A red
 * "something went wrong" over a correctly-enforced permission invites an
 * operator to file a bug against the system working as designed, and it hides
 * the one useful next step, which is knowing who to ask.
 */
export function UpdatesAccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title="Only super admins can publish announcements"
      description="Your role covers moderation — reports, comments and accounts — but broadcasting to every citizen in the network is restricted. Ask a super admin if you need this."
    />
  );
}
