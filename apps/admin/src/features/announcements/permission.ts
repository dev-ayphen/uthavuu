import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for this section.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The API enforces `platform:manage` on every announcements route
 * (`@RequireAdminPermissions`, the same gate `/admin/admins` and
 * `/admin/report-categories` sit behind). This is UX only: it stops an ops
 * admin being shown a page of controls the server will refuse, which reads as a
 * broken console rather than as a boundary working correctly.
 *
 * It uses the console's ONE existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and nothing else. In particular the role
 * key is never inspected here: `permissions` is the list the API granted, and
 * checking `role.key === "super_admin"` instead would silently deny a new role
 * the moment the backend grants it `platform:manage`.
 *
 * It fails CLOSED. No session, an unreachable API, or a session carrying no
 * permissions all resolve to `false`.
 *
 * READ AND WRITE SHARE THE PERMISSION. Every route in the contract — the list
 * included — needs `platform:manage`, so there is no "can view but not edit"
 * state to render. The page is gated whole; the actions inside it do not need a
 * second, finer check, and adding one would imply a distinction that does not
 * exist.
 */

/** The permission every announcements route requires. */
export const ANNOUNCEMENTS_PERMISSION = "platform:manage";

export async function canManageAnnouncements(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(ANNOUNCEMENTS_PERMISSION) ?? false;
}
