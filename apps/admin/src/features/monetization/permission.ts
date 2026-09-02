import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for the Monetization section.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The API enforces `platform:manage` on every route this section reads —
 * `GET /admin/sponsors` and everything under it — the same gate `/admin/admins`,
 * `/admin/report-categories` and the announcements routes sit behind. This is
 * UX only: it stops an ops admin being shown a page of figures the server will
 * refuse, which reads as a broken console rather than as a boundary working
 * correctly.
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
 * WHY THIS DUPLICATES `features/sponsors/permission.ts` INSTEAD OF IMPORTING IT.
 * Both resolve to the same permission string today, and that is a coincidence
 * of the current RBAC seed rather than a shared rule: sponsors is a commercial
 * relationship with an outside organisation, while the AdMob page is an
 * integration status document. If either gate is ever narrowed — a
 * `monetization:view` that lets an ops admin read totals without editing
 * campaigns is the obvious candidate — one of these files changes and the other
 * must not follow by accident. Announcements made the same call for the same
 * reason: each section owns its own mirror.
 */

/** The permission every endpoint this section reads requires. */
export const MONETIZATION_PERMISSION = "platform:manage";

export async function canViewMonetization(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(MONETIZATION_PERMISSION) ?? false;
}
