import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for Platform -> Support.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The API enforces `platform:manage` on `AdminSupportController` — the whole
 * controller, via a class-level `@RequireAdminPermissions('platform:manage')`,
 * which is where it actually matters. This is UX only: it stops an admin
 * without the permission being shown a workbench of controls the server will
 * refuse, which reads as a broken console rather than as a boundary working.
 *
 * It uses the console's ONE existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and nothing else. The role key is never
 * inspected: `permissions` is the list the API granted, and checking
 * `role.key === "super_admin"` instead would silently deny a new role the
 * moment the backend grants it `platform:manage`.
 *
 * It fails CLOSED. No session, an unreachable API, or a session carrying no
 * permissions all resolve to `false`.
 *
 * READ AND WRITE SHARE THE PERMISSION, so there is no "can view the queue but
 * not reply" state to render. The section is gated whole; the composer and the
 * controls inside it do not need a second, finer check, and adding one would
 * imply a distinction the API does not make.
 */

/** The permission every support-ticket route requires. */
export const SUPPORT_PERMISSION = "platform:manage";

export async function canManageSupport(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(SUPPORT_PERMISSION) ?? false;
}
