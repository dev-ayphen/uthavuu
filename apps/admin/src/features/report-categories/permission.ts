import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for Platform -> Categories.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The API enforces `platform:manage` on EVERY route in
 * `AdminCategoriesController` — the gate is declared at class level, so list,
 * create, update and delete are all covered by construction. This is UX only:
 * it stops an ops admin being shown a table of controls the server will refuse,
 * which reads as a broken console rather than as a boundary working correctly.
 *
 * The controller says in as many words why the gate is `platform:manage` and
 * not `reports:manage`: editing a category changes live mobile behaviour for
 * every citizen, which is a platform decision rather than a moderation one.
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
 * READ AND WRITE SHARE THE PERMISSION, so there is no "can view but not edit"
 * state to render. The page is gated whole; the buttons inside it do not need a
 * second, finer check, and adding one would imply a distinction that does not
 * exist.
 */

/** The permission every report-category route requires. */
export const REPORT_CATEGORIES_PERMISSION = "platform:manage";

export async function canManageReportCategories(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(REPORT_CATEGORIES_PERMISSION) ?? false;
}
