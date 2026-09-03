import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for Community -> Broadcasts.
 *
 * NOT A GATE. `AdminBroadcastsController` carries a class-level
 * `@RequireAdminPermissions('platform:manage')`, so every route in this feature
 * is enforced by the API. This is UX only: it stops an ops admin being handed a
 * page of controls the server will refuse, which reads as a broken console
 * rather than as a boundary working correctly.
 *
 * CODE-DERIVED, NOT ASSUMED. The permission below is read off the controller,
 * not inferred from the fact that Announcements happens to use the same one.
 * The API's own comment gives the reason it is `platform:manage` rather than a
 * moderation permission: a broadcast writes a notification into every selected
 * citizen's alert list and lights up their phone, irreversibly, which is a
 * platform decision and not a moderation one.
 *
 * It uses the console's one existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and never inspects the role key. Checking
 * `role.key === "super_admin"` instead would silently deny a new role the
 * moment the backend grants it `platform:manage`.
 *
 * It fails CLOSED: no session, an unreachable API, or a session carrying no
 * permissions all resolve to `false`.
 */

/** The permission every `/admin/broadcasts` route requires. */
export const BROADCASTS_PERMISSION = "platform:manage";

export async function canManageBroadcasts(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(BROADCASTS_PERMISSION) ?? false;
}
