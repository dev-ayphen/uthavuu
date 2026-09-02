import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui";
import { humanizeRoleKey } from "./schema";
import type { AdminAccountStatus } from "./types";
import type { AdminRoleRef } from "@/lib/roles";

/**
 * An admin's role, said in the API's own words.
 *
 * The label comes from the record, never from a local map — `src/lib/roles.ts`
 * explains why at length. `humanizeRoleKey` covers only the case where the API
 * sent a key with an empty label, which is a bug on the wire rather than a
 * state to design for; showing a mechanical "Super Admin" beats showing nothing
 * where the role is the whole point of the row.
 */
export function AdminRoleBadge({ role }: { role: AdminRoleRef | undefined }) {
  if (!role?.key) return <span className="text-fg-faint">—</span>;

  return (
    <Badge tone={role.key === "super_admin" ? "primary" : "neutral"}>
      {role.key === "super_admin" ? <ShieldCheck className="size-2.5" aria-hidden /> : null}
      {role.label || humanizeRoleKey(role.key)}
    </Badge>
  );
}

/**
 * Whether this account can sign in to the console.
 *
 * THREE STATES, NOT TWO. `GET /admin/admins/:id` returns a status;
 * `GET /admin/admins` does not (see `./types.ts`). The tempting shortcut —
 * `status?.key === "suspended" ? danger : success` — resolves a MISSING status
 * to a confident green "Active", which is the console inventing the single most
 * consequential fact on the row: whether this person can get in.
 *
 * So the third state says so, and points at the page that does know. It
 * disappears by itself the day the list endpoint returns what the detail one
 * already does.
 */
export function AdminStatusBadge({ status }: { status: AdminAccountStatus | undefined }) {
  if (!status?.key) {
    return (
      <Badge
        tone="neutral"
        title="The admin list endpoint doesn't return a status. Open the account to see whether its access is active or suspended."
      >
        Not reported
      </Badge>
    );
  }

  const suspended = status.key === "suspended";

  return (
    <Badge tone={suspended ? "danger" : "success"}>
      {status.label || (suspended ? "Suspended" : "Active")}
    </Badge>
  );
}

/**
 * The constraint that makes three actions impossible, shown one step BEFORE
 * the action it blocks — the same reasoning as the staff mark on
 * `features/users/user-status-badge.tsx`. An operator who can see this on the
 * row is not surprised by a disabled menu item.
 */
export function LastSuperAdminBadge() {
  return (
    <Badge
      tone="warning"
      title="The last super admin can't be suspended, revoked, or moved to another role — doing so would leave the console with nobody who can manage it."
    >
      Last super admin
    </Badge>
  );
}

/** Marks the signed-in operator's own row, so "why can't I suspend this?" answers itself. */
export function YouBadge() {
  return <Badge tone="info">You</Badge>;
}
