import type { AdminRoleRef } from "@/lib/roles";

/**
 * Shapes returned by the `/admin/admins` endpoints.
 *
 * Transcribed from `apps/api/src/admin/admin-accounts.controller.ts` and its
 * four DTOs — the real, landed implementation, read rather than assumed:
 *
 *   GET    /admin/admins                     -> AdminAccountDetail[]   ⚠ short shape, see below
 *   GET    /admin/admins/:id                 -> AdminAccountDetail
 *   POST   /admin/admins                     -> AdminAccountDetail     { name, email, password, roleKey }
 *   PATCH  /admin/admins/:id                 -> AdminAccountDetail     { name?, email?, roleKey? }
 *   POST   /admin/admins/:id/reset-password  -> 204                    { newPassword }
 *   POST   /admin/admins/:id/suspend         -> AdminAccountDetail     { reason? }
 *   POST   /admin/admins/:id/reactivate      -> AdminAccountDetail     { reason? }
 *   DELETE /admin/admins/:id                 -> 204   (revokes ADMIN ACCESS, keeps the account)
 *   POST   /admin/me/change-password         -> 204                    { currentPassword, newPassword }
 *
 * Every route except the last requires `platform:manage`.
 * `POST /admin/me/change-password` requires none: it is scoped to the caller by
 * the guard-resolved session, never by an id in the body, so an Ops Admin can
 * rotate their own password without being able to see the directory.
 *
 * WHY FOUR FIELDS ARE OPTIONAL WHEN THE CONTRACT SAYS THEY ARE NOT
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠ A MEASURED MISMATCH BETWEEN THE LIST AND THE DETAIL, LIVE RIGHT NOW.
 *
 * `GET /admin/admins/:id` returns the full shape — verified in
 * `apps/api/src/admin/admin-accounts.service.ts`, whose mapper builds `status`,
 * `lastLoginAt`, `isSelf` and `isLastSuperAdmin` and explains each one.
 *
 * `GET /admin/admins` — the LIST — does not. It is still served by
 * `AdminService.listAdmins()` on the older `AdminController`, and that query
 * selects exactly five columns: `userId`, `name`, `email`, `role`, `createdAt`.
 * No status. No last login. No flags. The two endpoints in the same feature
 * disagree, and the table is the one that comes up short.
 *
 * Declaring those four as required would be the console asserting it has been
 * told something it has not. The compiler would then let every renderer read
 * `record.status.key` — which is `undefined.key` against the live API — and,
 * worse, let `lastLoginAt` be treated as `null` and rendered as **"Never"**.
 * "Never signed in" is a claim about a person. Inventing it from a field the
 * API never sent is exactly the fabrication this task forbids.
 *
 * So they are optional, and `undefined` is a THIRD state everywhere they are
 * read: not "no", not "yes", but "the API has not said". `formatLastLogin`
 * below is where that distinction is spelled out.
 *
 * This is a temporary shape, and tightening it is a four-character diff: delete
 * the four `?` the moment `listAdmins()` returns what `findOne()` already does,
 * and TypeScript will point at every three-way renderer that can then collapse
 * to two. Reported to the backend rather than patched around: the console must
 * not compute a status the API is the authority on.
 */

/** `active` | `suspended` today. `string`, for the same reason as `AdminRoleRef.key`. */
export type AdminAccountStatus = { key: string; label: string };

export type AdminAccountDetail = {
  userId: string;
  name: string;
  email: string;
  /**
   * The API authors the label; the console keeps NO key->label map of its own.
   * See `src/lib/roles.ts` — a second copy is a second thing to forget.
   */
  role: AdminRoleRef;
  createdAt: string;

  // ── Sent by `GET /admin/admins/:id`, missing from the list. See above. ──

  status?: AdminAccountStatus;
  /** `null` means "has never signed in". `undefined` means "the API didn't say". */
  lastLoginAt?: string | null;
  /** True when this row is the signed-in operator. Never offer suspend/revoke. */
  isSelf?: boolean;
  /** Server-enforced: suspend, revoke and role-change are refused for this row. */
  isLastSuperAdmin?: boolean;
};

/**
 * The PATCH body, transcribed from `UpdateAdminAccountSchema`
 * (`apps/api/src/admin/dto/update-admin-account.dto.ts`).
 *
 * `roleKey`, NOT `role` — the response carries `role: { key, label }` and the
 * request takes the bare key under a different name. Getting this wrong is
 * invisible: Zod strips unknown properties, so a body sending `role` would be
 * accepted, change nothing, and answer 200 with the original role. A request
 * that looks like a promotion, reports success, and promotes nobody.
 *
 * All three are OPTIONAL server-side, with a `.refine()` rejecting the empty
 * body. This form always sends all three, so that refusal is unreachable from
 * here, and a field whose value is unchanged is simply a no-op — the service
 * compares each against the stored row before writing or auditing anything.
 */
export type UpdateAdminAccountPayload = {
  name: string;
  email: string;
  roleKey: string;
};

/** `POST /admin/admins/:id/reset-password` — another admin's credential. */
export type ResetPasswordPayload = { newPassword: string };

/** `POST /admin/me/change-password` — your own credential. */
export type ChangeOwnPasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export function isSuspended(status: AdminAccountStatus | undefined): boolean {
  return status?.key === "suspended";
}

// The role keys this build offers in the edit form used to be re-declared here.
// They now come from `@uthavu/libs-common` — `./schema.ts` imports them
// directly, and `apps/api/src/admin/admin-rbac.ts` re-exports the same array to
// its DTOs, so the `z.enum()` that turns an unrecognised key into a 400 and the
// `<select>` that offers them are reading one list. The LABELS are still
// deliberately absent: see `roleOptions()` in `./schema.ts`, which reads them
// off the records the API has already sent rather than keeping a second copy of
// the API's lookup table.

/**
 * Three outcomes, because there are three states and collapsing any two of
 * them tells an operator something untrue:
 *
 *   a timestamp -> the formatted date
 *   null        -> "Never" — the API says this person has never signed in
 *   undefined   -> "Not reported" — the API did not send the field at all
 *
 * The third is not hypothetical: it is what the LIST endpoint does today, while
 * the detail endpoint beside it answers properly. See the note at the top.
 */
export type LastLogin =
  | { kind: "at"; iso: string }
  | { kind: "never" }
  | { kind: "unreported" };

export function readLastLogin(value: string | null | undefined): LastLogin {
  if (value === undefined) return { kind: "unreported" };
  if (value === null) return { kind: "never" };
  return { kind: "at", iso: value };
}
