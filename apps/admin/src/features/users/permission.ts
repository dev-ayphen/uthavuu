import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for the Users section.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * `AdminUsersController` gates every route — the list, the detail, suspend and
 * reactivate — on `users:manage` (`@RequireAdminPermissions`). This is UX only:
 * the API enforces it. The console mirrors it so the Actions column is never
 * rendered for an operator every one of whose clicks the server would refuse,
 * which reads as a broken console rather than as a boundary working correctly.
 *
 * It uses the console's ONE existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and nothing else. The role key is never
 * inspected: `permissions` is the list the API actually granted, and checking
 * `role.key === "super_admin"` instead would deny a new role the moment the
 * backend grants it `users:manage`. It fails CLOSED.
 *
 * WHY IT LOOKS REDUNDANT TODAY, AND WHY IT STILL EARNS ITS KEEP
 * ───────────────────────────────────────────────────────────────────────────
 * Read and write share one permission, and both seeded roles hold it
 * (`ADMIN_ROLE_PERMISSIONS` in `apps/api/src/admin/admin-rbac.ts` grants
 * `users:manage` to super_admin AND ops_admin). So an operator who can see a
 * single row can also suspend: this resolves `true` for everyone who gets far
 * enough to read the table, and the column always renders.
 *
 * It is still the right seam. The check lives at the boundary where a future
 * split — a read-only `users:view`, an auditor role — would land, and on that
 * day the column disappears instead of filling with buttons that 403. The cost
 * is one `GET /admin/me` on a server render, which is exactly what the
 * announcements, sponsors and settings sections already pay.
 */

/** The permission every `/admin/users` route requires, read and write alike. */
export const USERS_PERMISSION = "users:manage";

export async function canModerateUsers(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(USERS_PERMISSION) ?? false;
}
