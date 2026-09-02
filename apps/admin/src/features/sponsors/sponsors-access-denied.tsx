import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui";

/**
 * What an ops admin sees on this section.
 *
 * Rendered as an EmptyState, NOT an ErrorState — the same call
 * `src/app/(console)/admins/page.tsx` and the announcements section make, for
 * the same reason. A red "something went wrong" over a correctly-enforced
 * permission invites an operator to file a bug against the system working as
 * designed, and it hides the one useful next step, which is knowing who to ask.
 */
export function SponsorsAccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title="Only super admins can manage sponsors"
      description="Your role covers moderation — reports, comments and accounts — but sponsorship is a commercial relationship with an outside organisation, so it's restricted. Ask a super admin if you need this."
    />
  );
}
