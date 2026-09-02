import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when `/admin/admins` refuses something.
 *
 * Every code below is transcribed from
 * `apps/api/src/admin/admin-accounts.service.ts` — read out of the exceptions
 * that raise them, not guessed. Same discipline as
 * `features/moderation/moderation-errors.ts`,
 * `features/announcements/update-errors.ts` and
 * `features/report-categories/category-errors.ts`; these codes are this
 * section's own, and those files are other features' surfaces, so they live
 * here in the same shape, ready to merge the day someone owns a shared
 * catalogue.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE. The API's prose gets reworded; the
 * code is the contract (see `ApiError.code`).
 *
 * Most of these are not failures at all. They are the API saying either "the
 * record already moved" or "that is a rule, not a bug" — and "Something went
 * wrong" is the wrong sentence for every one of them.
 */

const MESSAGES: Record<string, string> = {
  // ── The record moved while the page was open ─────────────────────────────
  ADMIN_NOT_FOUND:
    "That admin account no longer exists. Their access may have been revoked while this page was open.",
  ADMIN_ALREADY_SUSPENDED:
    "This account's access is already suspended — the page is now up to date.",
  ADMIN_NOT_SUSPENDED: "This account isn't suspended, so there is nothing to restore.",

  // ── Rules, not faults ────────────────────────────────────────────────────
  //
  // `LAST_SUPER_ADMIN` counts super admins who can actually SIGN IN, not rows
  // in a table — a suspended super admin is not a way back in, so they do not
  // count as a spare. Saying "promote another admin" is the actionable half.
  LAST_SUPER_ADMIN:
    "This is the last super admin who can still sign in. Suspending, revoking or demoting them would lock the console for everyone. Promote another admin to Super Admin first.",
  // The API refuses an admin acting on their OWN account through these routes —
  // including editing it. `POST /admin/me/change-password` is the one thing you
  // may do to yourself, which is why this message points at it.
  CANNOT_MODIFY_SELF:
    "The API doesn't let an admin change their own account here — ask another super admin. Changing your own password is the exception, and has its own button.",

  // ── Credentials ──────────────────────────────────────────────────────────
  INVALID_CURRENT_PASSWORD: "That isn't your current password. Nothing was changed.",
  NO_PASSWORD_CREDENTIAL:
    "This admin doesn't sign in with a password, so there is no password to change.",

  // ── Identity ─────────────────────────────────────────────────────────────
  ADMIN_EMAIL_TAKEN: "Another account already uses that email address.",

  // ── The guard, on every admin route ──────────────────────────────────────
  // Deliberately neutral: an ops admin reaching a super-only action is the
  // system working, not a fault to report.
  ADMIN_MISSING_PERMISSION:
    "Only a super admin can do this. Your role covers moderation, not console access.",
  ADMIN_NOT_AN_ADMIN: "This account has no console access.",
  ADMIN_NO_SESSION: "Your session has expired. Sign in again, then retry.",
};

/**
 * Codes meaning "the record already moved". The action did not happen, but
 * neither did anything break — the honest response is to refetch so the screen
 * stops disagreeing with the database, which is how an operator ends up trying
 * the same thing twice.
 */
const STALE_CONFLICT_CODES = new Set([
  "ADMIN_NOT_FOUND",
  "ADMIN_ALREADY_SUSPENDED",
  "ADMIN_NOT_SUSPENDED",
  // Not obviously stale, but it is: the flag that drives the disabled state is
  // computed from the same set this refusal counts, so being refused means the
  // row on screen has the wrong `isLastSuperAdmin` and a refetch fixes it.
  "LAST_SUPER_ADMIN",
]);

/** The code `GET /admin/admins/:id` uses for a record that is gone. */
export const ADMIN_NOT_FOUND_CODES = ["ADMIN_NOT_FOUND"] as const;

/**
 * Two refusals that are really about ONE FIELD, and arrive with no `errors[]`
 * array to say so.
 *
 * Both are raised by hand in the service — `ADMIN_EMAIL_TAKEN` from an explicit
 * uniqueness check before the update, `INVALID_CURRENT_PASSWORD` from Better
 * Auth's verifier — so `ApiError.fieldErrors` is empty and the generic
 * field-mapping path would miss them entirely, dropping a problem with one box
 * into the form-level banner and leaving the operator to work out which of
 * three to change.
 */
export const CODE_TO_FIELD: Record<string, string> = {
  ADMIN_EMAIL_TAKEN: "email",
  INVALID_CURRENT_PASSWORD: "currentPassword",
};

export function adminAccountErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }

    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;

    // A Zod refinement with no field path — `UpdateAdminAccountSchema`'s
    // empty-body guard is the only one that can reach here — arrives as
    // `{ statusCode: 400, message: "Validation failed", errors: [{ path: [] }] }`.
    // `ApiError` cannot flatten a pathless issue onto a field, so the operator
    // would be shown the bare words "Validation failed". Every form here always
    // submits every field, so reaching this means the payload was built wrong
    // rather than that the operator typed something bad.
    if (error.status === 400 && error.code === null && error.fieldErrors.length === 0) {
      return "The console sent a change the API couldn't read. Nothing was saved — please report this.";
    }
  }

  return getErrorMessage(error);
}

/** True when the refusal means the row on screen is out of date. */
export function isAdminAccountStale(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code);
}

/**
 * Re-word a refusal into this section's prose WITHOUT losing anything the
 * receiver branches on.
 *
 * `ConfirmActionDialog` is the console's one confirmation surface and it is
 * hard-wired to `features/moderation/moderation-errors.ts` — it calls
 * `moderationErrorMessage`, `isStaleConflict` and `isPermanentRefusal` itself,
 * with no hook for a section to supply its own map. That is right for the file
 * it lives in and wrong to fork, so this section meets it where it is: the
 * caller catches, re-words, and re-throws an `ApiError` carrying the SAME
 * status, code and field errors and a better message. `moderationErrorMessage`
 * then finds no code it knows, falls through to `getErrorMessage`, and returns
 * this message verbatim — while `isPermanentRefusal` still sees the real code
 * and can still disable a button that will never succeed.
 *
 * Anything that is not an `ApiError` (an aborted request, a bug in this
 * console) is returned untouched: wrapping it would claim it came from the API.
 */
export function asAdminAccountError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;

  const message = adminAccountErrorMessage(error);
  if (message === error.message) return error;

  return new ApiError(message, {
    status: error.status,
    code: error.code,
    fieldErrors: error.fieldErrors,
  });
}
