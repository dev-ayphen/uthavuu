import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui";

/**
 * What an admin without `platform:manage` sees on this page.
 *
 * Rendered as an EmptyState, NOT an ErrorState — the same call
 * `announcements` and `(console)/admins/page.tsx` make, for the same reason. A
 * red "something went wrong" over a correctly-enforced permission invites an
 * operator to file a bug against the system working as designed, and it hides
 * the one useful next step, which is knowing who to ask.
 */
export function SettingsAccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title="Only super admins can change app settings"
      description="Your role covers moderation — reports, comments and accounts — but these switches change how the app behaves for every citizen at once, so they are restricted. Ask a super admin if you need this."
    />
  );
}
