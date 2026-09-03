import { SUPER_ADMIN_ROLE_KEY, type AdminRoleKey } from "@uthavu/libs-common";

/**
 * Admin roles — shared by server and client, so NO "server-only" here.
 *
 * The API is the source of truth for both the role set and its display text.
 * `GET /admin/me` returns `role: { key, label }`, e.g.
 * `{ key: "ops_admin", label: "Ops Admin" }`.
 */

/**
 * Role keys this build knows how to make permission decisions about.
 *
 * Aliased from `@uthavu/libs-common`, never restated. The console typing the
 * second role as `moderator` while the API returned `ops_admin` is a bug this
 * project actually shipped — every ops admin would have looked signed out — and
 * a hand-copied union is exactly how it happened.
 */
export type KnownAdminRole = AdminRoleKey;

export type AdminRoleRef = {
  /**
   * Stable identifier, used for permission checks.
   *
   * Deliberately `string`, not the union: the API may add a role before this
   * console is redeployed. An unknown key must still produce a usable session
   * with the API's own label — otherwise adding a role server-side would make
   * everyone holding it look signed out.
   */
  key: string;
  /**
   * Display text, authored by the API. The console does NOT keep its own
   * key->label map: a second copy is a second thing to forget to update.
   */
  label: string;
};

/**
 * Permission checks fail CLOSED. An unrecognised key is simply not a super
 * admin, so it gets the smaller set of capabilities rather than the larger.
 * The API is what actually enforces this; the console only mirrors it for UX.
 */
export function isSuperAdmin(role: AdminRoleRef | null | undefined): boolean {
  return role?.key === SUPER_ADMIN_ROLE_KEY;
}
