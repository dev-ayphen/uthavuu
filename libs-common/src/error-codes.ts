// Error codes a client BRANCHES ON.
//
// Every code below has at least two independent readers — the API that raises
// it and a client that changes behaviour when it sees it — which is exactly
// what makes them contract rather than implementation detail. They lived as
// separate literals on each side until now, and two of this project's bugs
// came from that: a console that typed the second admin role as `moderator`
// while the API returned `ops_admin`, and a mobile client calling a path the
// API does not serve. A code that only one side spells correctly is a branch
// that never fires, and a branch that never fires looks exactly like a feature
// that was never built.
//
// SCOPE: only the code STRINGS. The prose the API sends alongside them stays in
// apps/api — it is server-authored, reworded freely, and no client reads it for
// meaning. Mobile renders its own localised copy from its i18n catalogue
// (English + Tamil), so importing the API's English sentence here would be
// worse than useless.

/**
 * `403 ACCOUNT_SUSPENDED` — this account is suspended.
 *
 * Deliberately 403 with a code and NOT a bare 401: a 401 is indistinguishable
 * from an expired session, and mobile's 401 path clears the token and bounces
 * to Login, where a suspended user would sign in successfully (the API does not
 * revoke the session) and then be blocked again on the next screen with no
 * explanation. The whole point of this constant is letting the client tell the
 * two apart. See apps/api/src/account-status/account-status.ts and
 * docs/decisions/0011.
 */
export const ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED';

/**
 * The two platform-wide write freezes, in precedence order — `MAINTENANCE_MODE`
 * wins when both switches are on, because it is the more specific and more
 * actionable thing to tell someone.
 *
 * An admin flips these on the console's Platform tab; citizen writes then come
 * back 403 with one of these codes while reads keep working. The client's job
 * is to say the honest reason instead of "something went wrong" and leave the
 * user exactly where they are — the session is fine and the account is fine.
 */
export const MAINTENANCE_MODE = 'MAINTENANCE_MODE';
export const READ_ONLY_MODE = 'READ_ONLY_MODE';

export const PLATFORM_BLOCK_CODES = [MAINTENANCE_MODE, READ_ONLY_MODE] as const;

export type PlatformBlockCode = (typeof PLATFORM_BLOCK_CODES)[number];

/**
 * The three refusals `AdminGuard` can raise, on every `/admin/*` route.
 *
 * All three are 403, and the code is the ONLY thing that separates them — which
 * is why the console must never branch on the status or the message:
 *
 *   ADMIN_NO_SESSION        No signed-in session. In practice this is usually a
 *                           cross-origin cookie that did not travel, so the
 *                           console treats it as "signed out", not as an error.
 *   ADMIN_NOT_AN_ADMIN      A perfectly valid citizen session. Being signed in
 *                           is not being staff.
 *   ADMIN_MISSING_PERMISSION  Staff, but this route needs a permission this
 *                           role does not hold. Retrying cannot help.
 */
export const ADMIN_NO_SESSION = 'ADMIN_NO_SESSION';
export const ADMIN_NOT_AN_ADMIN = 'ADMIN_NOT_AN_ADMIN';
export const ADMIN_MISSING_PERMISSION = 'ADMIN_MISSING_PERMISSION';

export const ADMIN_GATE_CODES = [
  ADMIN_NO_SESSION,
  ADMIN_NOT_AN_ADMIN,
  ADMIN_MISSING_PERMISSION,
] as const;

export type AdminGateCode = (typeof ADMIN_GATE_CODES)[number];
