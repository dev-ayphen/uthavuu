import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui";

/**
 * An account's state, said in words.
 *
 * WHY THE STAFF MARK SITS HERE
 * ───────────────────────────────────────────────────────────────────────────
 * `AdminUsersService.requireSuspendableUser()` refuses to suspend an account
 * that holds an admin role (CANNOT_SUSPEND_ADMIN). Marking staff in the same
 * cell as the status is what stops a moderator picking a row, opening it,
 * writing a reason and only then being told no — the constraint is visible one
 * step before the action it blocks.
 */
export function UserStatusBadge({
  status,
  isStaff = false,
  role = null,
}: {
  status: { key: string; suspendedAt?: string | null };
  isStaff?: boolean;
  role?: { key: string; label: string } | null;
}) {
  const suspended = status.key === "suspended";

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge tone={suspended ? "danger" : "success"}>{suspended ? "Suspended" : "Active"}</Badge>
      {isStaff ? (
        <Badge tone="primary" title="Staff accounts cannot be suspended from the console.">
          <ShieldCheck className="size-2.5" aria-hidden />
          {role?.label ?? "Staff"}
        </Badge>
      ) : null}
    </span>
  );
}
