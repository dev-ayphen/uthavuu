import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for Admin Accounts.
 *
 * WHAT THIS IS AND IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The API enforces `platform:manage` on `/admin/admins` — that is the existing
 * gate on `GET /admin/admins` (`AdminController`), and it is the permission
 * `admin-rbac.ts` describes as "Manage platform settings and admins". Only
 * `super_admin` holds it. This module is UX ONLY: the API is the enforcer, and
 * every rule below is mirrored so the console does not offer an operator a
 * control the server has already decided to refuse — which reads as a broken
 * console rather than as a boundary working correctly.
 *
 * It uses the console's ONE existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and nothing else. In particular the role
 * key is never inspected: `permissions` is the list the API actually granted,
 * and checking `role.key === "super_admin"` instead would silently deny a new
 * role the moment the backend grants it `platform:manage`. (`isSuperAdmin()` in
 * `src/lib/roles.ts` exists for the places that genuinely mean "is this THE
 * super-admin role"; a capability check is not one of them.)
 *
 * It fails CLOSED. No session, an unreachable API, or a session carrying no
 * permissions all resolve to `false` / `null`.
 *
 * THE ONE ASYMMETRY, AND WHY IT IS NOT A SECOND MECHANISM
 * ───────────────────────────────────────────────────────────────────────────
 * Read and write share `platform:manage` for everything done TO ANOTHER ADMIN.
 * They do not cover the two things an admin does to THEMSELF: editing their own
 * profile and changing their own password. `POST /admin/me/change-password`
 * needs no permission at all — it is scoped to the caller by its path, not by a
 * role — so an ops admin who cannot see this list can still change their own
 * password, and the access-denied state offers exactly that and nothing else.
 *
 * `selfUserId` exists for the same seam. `AdminAccountDetail.isSelf` is the
 * server's answer to "is this row you", and it is the one the console prefers —
 * but the deployed endpoint does not send it yet (see `./types.ts`), and a
 * missing `isSelf` would read as `false` and put "Suspend" on the operator's
 * own row. Comparing against the session's own `userId` is not a second
 * permission mechanism; it is the console's own identity, used only to make the
 * check MORE restrictive when the API is silent. It can never grant anything.
 */

/** The permission every `/admin/admins` route requires. */
export const ADMIN_ACCOUNTS_PERMISSION = "platform:manage";

export type AdminAccountsAccess = {
  /** May list, edit, reset, suspend and revoke OTHER admins. */
  canManage: boolean;
  /** The signed-in operator's own user id, or null if there is no session. */
  selfUserId: string | null;
};

export async function getAdminAccountsAccess(): Promise<AdminAccountsAccess> {
  const session = await getAdminSession();

  return {
    canManage: session?.permissions.includes(ADMIN_ACCOUNTS_PERMISSION) ?? false,
    selfUserId: session?.userId ?? null,
  };
}
