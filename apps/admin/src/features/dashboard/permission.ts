import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for the dashboard's two moderation panels.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The Dashboard itself is open to every admin — `GET /admin/dashboard` and
 * `GET /admin/activity` carry no `@RequireAdminPermissions` at all, because
 * both roles land here. The two panels beside the activity feed are the
 * exception: they read OTHER sections' endpoints, and those are gated.
 *
 *   Urgent requests        `GET /admin/reports`          -> reports:manage
 *                          (AdminReportsController, per route)
 *   Latest flagged
 *   comments               `GET /admin/flagged-comments` -> comments:manage
 *                          (AdminCommentsController, per route)
 *
 * This is UX ONLY. The API enforces both, and nothing here weakens that: an
 * admin who lacks a permission can still call the endpoint and will still be
 * refused. What this prevents is a panel that renders itself only to fill with
 * "You don't have permission to view this" — five dead panels read as a broken
 * console, not as a boundary working correctly. The sidebar was gated on
 * exactly this reasoning (config/nav.ts) and this matches its posture.
 *
 * THE TWO GATES ARE NOT ONE GATE. Both seeded roles hold both permissions
 * today, so in practice an ops_admin sees both panels — but they are separate
 * rows in `admin_role_permissions`, and revoking one must not take the other
 * with it. They are resolved separately here for that reason, and the panels
 * are rendered independently so one disappearing leaves the other in place.
 *
 * It uses the console's ONE existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and nothing else. The role key is never
 * inspected: `permissions` is the list the API actually granted, and checking
 * `role.key === "super_admin"` instead would deny a new role the moment the
 * backend grants it `reports:manage`.
 *
 * It fails CLOSED. No session, an unreachable API, or a session carrying no
 * permissions all resolve to `false` for both panels.
 */

/** The permission `GET /admin/reports` requires. */
export const URGENT_REQUESTS_PERMISSION = "reports:manage";

/** The permission `GET /admin/flagged-comments` requires. */
export const FLAGGED_COMMENTS_PERMISSION = "comments:manage";

export type DashboardPanelAccess = {
  urgentRequests: boolean;
  flaggedComments: boolean;
};

/**
 * Both answers from ONE session lookup.
 *
 * Two `canX()` helpers would be two `GET /admin/me` round trips on every
 * dashboard render, for two facts that come out of the same response.
 */
export async function dashboardPanelAccess(): Promise<DashboardPanelAccess> {
  const session = await getAdminSession();
  const granted = session?.permissions ?? [];

  return {
    urgentRequests: granted.includes(URGENT_REQUESTS_PERMISSION),
    flaggedComments: granted.includes(FLAGGED_COMMENTS_PERMISSION),
  };
}
