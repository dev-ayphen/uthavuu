import { z } from "zod";

import type { AdminRoleRef } from "@/lib/roles";
import { ADMIN_ROLE_KEYS } from "@uthavu/libs-common";
import { type AdminAccountDetail, type UpdateAdminAccountPayload } from "./types";

/**
 * The three forms this section owns, and the mappers either side of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STRUCTURAL RULE: THERE IS NO PASSWORD FIELD ON THE EDIT SCHEMA
 * ─────────────────────────────────────────────────────────────────────────────
 * `adminEditSchema` has exactly three fields — name, email, role — and cannot
 * grow a fourth by accident, because `formValuesToUpdatePayload` builds the
 * PATCH body from those three names and nothing else. Editing an identity and
 * changing a credential are separate acts with different blast radii and (for
 * the reset case) different permissions, so they are separate schemas, separate
 * dialogs and separate endpoints. A "while you're here, set a new password"
 * field on an edit form is how a routine name correction becomes an
 * unannounced credential rotation.
 *
 * The two password schemas differ in exactly one field, and that difference is
 * the whole point:
 *
 *   changeOwnPasswordSchema  currentPassword + newPassword + confirmNewPassword
 *   resetPasswordSchema                        newPassword + confirmPassword
 *
 * The reset form has NO "current password". A super admin does not know another
 * person's password, and a field asking for it would be theatre — it would
 * either be ignored by the server or filled in with a guess.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS MIRRORED FROM THE BACKEND, AND WHAT IS DELIBERATELY NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * The rule everywhere in this console: a client rule LOOSER than the server's
 * produces a 400 the operator has to decode, and a client rule STRICTER than
 * the server's silently refuses something the API would have accepted — the
 * harder bug to notice, because nothing ever errors.
 *
 * Every bound below is transcribed from the DTOs in
 * `apps/api/src/admin/dto/`, and matches them EXACTLY in both directions:
 *
 *   name          trim, 2..120        create-admin-account.dto.ts
 *   email         trim, .email(), 255 same file; NOT lower-cased — the DTO says
 *                                     why (Better Auth looks the account up by
 *                                     the string it was given)
 *   roleKey       z.enum(['super_admin','ops_admin'])
 *   password      8..128, NOT trimmed  `AdminPasswordSchema`
 *   currentPass.  1..128
 *
 * Two of those deserve naming:
 *
 *   8 IS NOT A TASTE DECISION. The DTO's own comment: it is
 *   `emailAndPassword.minPasswordLength` in the API's auth config, and there is
 *   no password-reset email in this product (ADR 0003) to recover from a
 *   mismatch. 128 is Better Auth's `maxPasswordLength` default.
 *
 *   NOTHING IS TRIMMED ON A PASSWORD, at either end of the wire. The DTO makes
 *   the same call: in a name a trailing space is a typo, in a password it is a
 *   character, and silently removing it would store a different secret from the
 *   one the operator typed and read out to the new admin.
 *
 * Nothing beyond these is invented — no character-class rule, no "must contain
 * a digit". Each would refuse a password the API accepts, and would teach an
 * operator a rule that is not true. The requirements list in the dialog shows
 * exactly what is validated here, so the two cannot drift apart.
 *
 * Every field is a string, matching what an `<input>` yields — there is no
 * half-parsed intermediate state to reason about.
 */

// From `AdminPasswordSchema`. Changing either without changing the DTO turns a
// form that looks fine into a 400 at submit time.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const NAME_MIN = 2;
const NAME_MAX = 120;
const EMAIL_MAX = 255;

const password = z
  .string()
  // `.min()` on the raw value, NOT on a trimmed one — see the note above.
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `At most ${PASSWORD_MAX} characters.`);

// ─────────────────────────────────────────────────────────────────────────────
// Edit: name, email, role. No password. Ever.
// ─────────────────────────────────────────────────────────────────────────────

export const adminEditSchema = z.object({
  name: z
    .string()
    .trim()
    .min(NAME_MIN, `At least ${NAME_MIN} characters — this is how they appear in the audit log.`)
    .max(NAME_MAX, `Keep the name under ${NAME_MAX} characters.`),
  email: z
    .email("Enter a valid email address.")
    .trim()
    .max(EMAIL_MAX, `Keep the email under ${EMAIL_MAX} characters.`),
  /**
   * The field is named `roleKey`, not `role`, and that is not cosmetic. It is
   * the name the API's DTO uses, so a server `validationErrors` entry pathed to
   * `roleKey` lands on this field via `setError` instead of being swept into
   * the form-level banner — and `formValuesToUpdatePayload` cannot build a body
   * whose key does not match the one the server reads.
   *
   * Deliberately a plain string rather than a TypeScript enum over
   * `ADMIN_ROLE_KEYS`: the DTO validates it with `z.enum()` server-side, which
   * is the enforcement, and `roleOptions()` below only ever offers keys that
   * exist — so a closed union here would buy nothing and would make the form
   * reject a role the backend added before this console was redeployed.
   */
  roleKey: z.string().min(1, "Pick a role."),
});

export type AdminEditValues = z.infer<typeof adminEditSchema>;

/** Every field a server `validationErrors` entry is allowed to land on. */
const EDIT_FIELD_NAMES = [
  "name",
  "email",
  "roleKey",
] as const satisfies readonly (keyof AdminEditValues)[];

export function isAdminEditField(path: string): path is keyof AdminEditValues {
  return (EDIT_FIELD_NAMES as readonly string[]).includes(path);
}

/**
 * API record -> form values.
 *
 * Everything is coalesced even though the contract declares no nullable field
 * here: a `null` handed to a React input flips it from controlled to
 * uncontrolled, the warning is easy to miss, and the symptom is that the
 * operator's typing is silently dropped. The guard costs nothing and survives
 * the API relaxing a column later.
 */
export function adminToEditValues(record: AdminAccountDetail): AdminEditValues {
  return {
    name: record.name ?? "",
    email: record.email ?? "",
    roleKey: record.role?.key ?? "",
  };
}

/**
 * Form values -> PATCH body.
 *
 * All three go every time, even when unchanged. The DTO makes each optional and
 * `.refine()`s against an empty body, so sending all three can never trip that
 * refusal — and the service compares each field against the stored row before
 * writing or auditing anything, so an unchanged value is a genuine no-op rather
 * than a spurious audit entry.
 *
 * THREE FIELDS IN, THREE FIELDS OUT. This function is where the "no password on
 * the edit form" rule is actually enforced: a credential cannot reach
 * `PATCH /admin/admins/:id` even if someone later adds an input to the dialog,
 * because the body is built from these three names and nothing else.
 */
export function formValuesToUpdatePayload(values: AdminEditValues): UpdateAdminAccountPayload {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    roleKey: values.roleKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Passwords
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Change YOUR OWN password. Proving you know the current one is what stops an
 * unattended session being turned into a permanent account takeover.
 */
export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Enter your current password.")
      .max(PASSWORD_MAX, `At most ${PASSWORD_MAX} characters.`),
    newPassword: password,
    confirmNewPassword: z.string().min(1, "Type the new password again."),
  })
  .superRefine((values, ctx) => {
    // Mirrors `ChangeMyPasswordSchema`'s own `.refine()`, ON THE SAME FIELD it
    // paths to (`newPassword`), so the client and the server put the error in
    // the same place. The server rejects a no-op rotation because it would
    // write an audit row claiming the credential changed when it did not.
    if (values.currentPassword && values.newPassword === values.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "The new password must be different from your current one.",
      });
    }

    if (values.newPassword !== values.confirmNewPassword) {
      ctx.addIssue({
        code: "custom",
        // On the confirmation, not on the form root: it is the field to retype,
        // and an error on the root leaves the operator hunting for which of
        // three boxes is wrong.
        path: ["confirmNewPassword"],
        message: "These two don't match.",
      });
    }
  });

export type ChangeOwnPasswordValues = z.infer<typeof changeOwnPasswordSchema>;

/**
 * Reset ANOTHER admin's password. No current-password field — see the note at
 * the top of this file.
 */
export const resetPasswordSchema = z
  .object({
    newPassword: password,
    confirmPassword: z.string().min(1, "Type the new password again."),
  })
  .superRefine((values, ctx) => {
    if (values.newPassword !== values.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "These two don't match.",
      });
    }
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * Field names a server `validationErrors` entry may land on, per form. Kept as
 * two lists rather than one union so a `currentPassword` error can never be
 * routed onto a reset form that has no such field — where `setError` would
 * silently attach it to nothing and the operator would see a submit that did
 * nothing at all.
 */
const CHANGE_PASSWORD_FIELDS = [
  "currentPassword",
  "newPassword",
  "confirmNewPassword",
] as const satisfies readonly (keyof ChangeOwnPasswordValues)[];

const RESET_PASSWORD_FIELDS = [
  "newPassword",
  "confirmPassword",
] as const satisfies readonly (keyof ResetPasswordValues)[];

export function isChangePasswordField(path: string): path is keyof ChangeOwnPasswordValues {
  return (CHANGE_PASSWORD_FIELDS as readonly string[]).includes(path);
}

export function isResetPasswordField(path: string): path is keyof ResetPasswordValues {
  return (RESET_PASSWORD_FIELDS as readonly string[]).includes(path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Role options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The roles the edit form may offer, with the API's own labels.
 *
 * THE KEYS ARE CONTRACT; THE LABELS ARE THE API'S TO AUTHOR
 * ───────────────────────────────────────────────────────────────────────────
 * `src/lib/roles.ts` is explicit that the console keeps NO key->label map,
 * because "a second copy is a second thing to forget to update". That leaves a
 * real problem for a `<select>`, which needs display text for a role the
 * operator does not currently hold — and there is no `GET /admin/roles` in the
 * contract to ask.
 *
 * So the labels are harvested from the records the API has already sent. Every
 * admin row carries `role: { key, label }`, so the label for any role SOMEBODY
 * HOLDS is available without a second source of truth, and it updates itself
 * when the backend renames one.
 *
 * `humanizeRoleKey` is the last resort for a contract key that nobody currently
 * holds — a console with two super admins and no ops admin, which is exactly
 * the state a fresh install is in. It is a mechanical transform of the key, not
 * a stored label: it cannot drift out of date, because it has nothing to drift
 * from. The moment one person holds the role, the API's real label replaces it.
 * (As it happens the two agree today — `ADMIN_ROLES` in the API labels them
 * "Super Admin" and "Ops Admin" — but that is a coincidence this code does not
 * rely on, and the API stays the authority either way.)
 */
export function roleOptions(
  records: readonly AdminAccountDetail[],
  current: AdminRoleRef | undefined,
): AdminRoleRef[] {
  const byKey = new Map<string, string>();

  // Weakest first, so a real label always wins over a derived one.
  for (const key of ADMIN_ROLE_KEYS) byKey.set(key, humanizeRoleKey(key));
  for (const record of records) {
    if (record.role?.key) byKey.set(record.role.key, record.role.label || humanizeRoleKey(record.role.key));
  }
  // The role this admin actually holds is always offerable, even if it is one
  // this build has never heard of — otherwise opening the edit form on an
  // unknown role would silently propose reassigning them to something else.
  if (current?.key) byKey.set(current.key, current.label || humanizeRoleKey(current.key));

  return [...byKey].map(([key, label]) => ({ key, label }));
}

/** `super_admin` -> `Super Admin`. A display transform, never a stored label. */
export function humanizeRoleKey(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
