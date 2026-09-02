import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui";

/**
 * What an admin without `platform:manage` sees on this page.
 *
 * Rendered as an EmptyState, NOT an ErrorState — the same call announcements,
 * app settings and `(console)/admins/page.tsx` make, for the same reason. A red
 * "something went wrong" over a correctly-enforced permission invites an
 * operator to file a bug against the system working as designed, and it hides
 * the one useful next step, which is knowing who to ask.
 *
 * Note what changed by adding this: before, an ops admin loaded the page, the
 * list fetch came back 403, and the table rendered a refusal state — correct,
 * but arrived at by making a request that was always going to fail. Resolving
 * it server-side means the section is never rendered at all for someone who
 * cannot use it.
 */
export function CategoriesAccessDenied() {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title="Only super admins can change categories"
      description="Your role covers moderation — reports, comments and accounts. A category edit changes what every citizen can ask for help with, and how long their next request stays live, so it is restricted. Ask a super admin if you need this."
    />
  );
}
