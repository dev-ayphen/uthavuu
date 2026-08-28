import "server-only";

import { ApiError } from "./api-error";
import type { AdminRoleRef } from "./roles";
import { serverApiFetch } from "./server-api";

/**
 * Admin session — resolved server-side from `GET /admin/me`.
 *
 * TWO RULES THIS SEAM EXISTS TO ENFORCE:
 *
 *  1. The role comes from the SESSION, resolved server-side. Never from a URL
 *     query string. The prototype navigated to `/admin/dashboard?role=super`,
 *     which let anyone grant themselves super-admin by editing the address
 *     bar. CLAUDE.md names that fail-open pattern as the thing not to build.
 *
 *  2. It fails CLOSED. No session cookie, an unreachable API, or a rejected
 *     session all resolve to `null`, and `null` means no access — never a
 *     default role, never a fallback to the highest privilege.
 *
 *     Note what this does NOT do: reject a session because the role key is
 *     one this build hasn't heard of. The role set lives in the API
 *     (`admin_roles`), so a new role must degrade to fewer permissions, not
 *     to a broken session. See isSuperAdmin() in ./roles.
 */

export type AdminSession = {
  userId: string;
  name: string;
  email: string;
  role: AdminRoleRef;
  /** Permission keys the API granted. Mirrored for UX only; the API enforces. */
  permissions: string[];
};

/**
 * Why the caller could not get a session. The API returns 403 for all three,
 * with a `code` distinguishing them, and they need opposite handling:
 *
 *   "signed-out"  -> no cookie / rejected session. Redirect to /login.
 *   "not-admin"   -> a valid citizen session with no admin_users row. Do NOT
 *                    redirect to /login: they just proved who they are, and
 *                    bouncing them back to sign in again is an endless loop.
 *   "unreachable" -> the API never answered. Not an auth outcome at all;
 *                    saying "please sign in" would blame the operator for an
 *                    outage. Still denies access — this fails closed.
 */
export type SessionDenial = "signed-out" | "not-admin" | "unreachable";

export type SessionResult =
  | { session: AdminSession; denial: null }
  | { session: null; denial: SessionDenial };

type AdminMeResponse = {
  userId: string;
  name: string;
  email: string;
  role: AdminRoleRef;
  permissions: string[];
};

/**
 * The full result, including WHY access was denied. Use this where the reason
 * changes what the user should see — chiefly the console route guard.
 */
export async function getAdminSessionResult(): Promise<SessionResult> {
  try {
    const me = await serverApiFetch<AdminMeResponse>("/admin/me");

    // Trust the shape only as far as it has been checked. A malformed body is
    // a denial, not a half-populated session rendering "undefined" as a name.
    if (!me || typeof me.userId !== "string" || !me.role || typeof me.role.key !== "string") {
      return { session: null, denial: "signed-out" };
    }

    return {
      session: {
        userId: me.userId,
        name: typeof me.name === "string" ? me.name : me.email,
        email: me.email,
        // The API authors the label; see ./roles for why no local map exists.
        role: { key: me.role.key, label: me.role.label },
        permissions: Array.isArray(me.permissions) ? me.permissions : [],
      },
      denial: null,
    };
  } catch (error) {
    return { session: null, denial: classifyDenial(error) };
  }
}

function classifyDenial(error: unknown): SessionDenial {
  if (!(error instanceof ApiError)) return "signed-out";
  if (error.isNetworkFailure) return "unreachable";

  // Branch on the code, never the prose — the message may be reworded, the
  // code is the contract. ADMIN_MISSING_PERMISSION cannot appear on /admin/me
  // (it requires no specific permission), so it is not handled here.
  if (error.code === "ADMIN_NOT_AN_ADMIN") return "not-admin";
  return "signed-out";
}

/** The session alone, for callers that only need "who is this". */
export async function getAdminSession(): Promise<AdminSession | null> {
  return (await getAdminSessionResult()).session;
}
