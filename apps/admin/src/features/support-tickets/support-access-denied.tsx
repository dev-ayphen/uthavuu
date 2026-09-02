import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui";

/**
 * What an admin without `platform:manage` sees on this section.
 *
 * Rendered as an EmptyState, NOT an ErrorState — the same call
 * `src/app/(console)/admins/page.tsx` and `UpdatesAccessDenied` make, for the
 * same reason. A red "something went wrong" over a correctly-enforced
 * permission invites an operator to file a bug against the system working as
 * designed, and it hides the one useful next step, which is knowing who to ask.
 */
export function SupportAccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title="Only super admins can work support tickets"
      description="Support threads carry citizens' phone numbers and staff-only internal notes, so the queue is restricted to roles holding platform:manage. Ask a super admin if you need access."
    />
  );
}
