import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for App Settings.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The API enforces `platform:manage` on `GET` and `PATCH /admin/settings`, the
 * same gate `/admin/admins`, `/admin/report-categories` and the announcements
 * routes sit behind. This is UX only: it stops an ops admin being shown a page
 * of switches the server will refuse, which reads as a broken console rather
 * than as a boundary working correctly.
 *
 * It uses the console's ONE existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and nothing else. In particular the role
 * key is never inspected: `permissions` is the list the API granted, and
 * checking `role.key === "super_admin"` instead would silently deny a new role
 * the moment the backend grants it `platform:manage`.
 *
 * It fails CLOSED. No session, an unreachable API, or a session carrying no
 * permissions all resolve to `false`.
 *
 * READ AND WRITE SHARE THE PERMISSION, so there is no "can view but not edit"
 * state to render. The page is gated whole; the switches inside it do not need
 * a second, finer check, and adding one would imply a distinction that does not
 * exist.
 */

/** The permission both settings routes require. */
export const APP_SETTINGS_PERMISSION = "platform:manage";

export async function canManageAppSettings(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(APP_SETTINGS_PERMISSION) ?? false;
}
