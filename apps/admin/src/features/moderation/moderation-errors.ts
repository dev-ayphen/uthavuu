import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when a moderation action is refused.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE — the API's prose gets reworded, the
 * code is the contract (see `ApiError.code`).
 *
 * Most of these are not failures at all: they are the API telling the console
 * that the record moved while the dialog was open. Someone else closed the
 * report, or the operator double-clicked, or the row on screen is a minute
 * stale. "Something went wrong" is the wrong sentence for every one of them —
 * the right one names what already happened and says the view is being
 * refreshed, which is exactly what `isStaleConflict` drives.
 */
const MESSAGES: Record<string, string> = {
  // Reports
  REPORT_NOT_FOUND:
    "That report no longer exists. It may have been permanently removed while this page was open.",
  REPORT_ALREADY_CLOSED: "This report is already closed — the list is now up to date.",
  REPORT_ALREADY_COMPLETED:
    "A completed report can't be closed. The help arrived, so there is nothing to cancel.",
  REPORT_ALREADY_HIDDEN: "This report is already hidden — the list is now up to date.",
  REPORT_NOT_CLOSED: "Only a closed report can be reopened. This one isn't closed.",
  REPORT_NOT_HIDDEN: "This report isn't hidden, so there is nothing to reinstate.",
  REPORT_HIDDEN: "Reinstate this report before changing its status.",

  // Users
  USER_NOT_FOUND: "That account no longer exists.",
  USER_ALREADY_SUSPENDED: "This account is already suspended — the page is now up to date.",
  USER_NOT_SUSPENDED: "This account isn't suspended, so there is nothing to reactivate.",
  CANNOT_SUSPEND_ADMIN:
    "Staff accounts can't be suspended from here. Revoke their admin role instead.",
  CANNOT_SUSPEND_SELF: "You can't suspend your own account.",

  // Comments and flags
  COMMENT_NOT_FOUND: "That comment no longer exists.",
  COMMENT_ALREADY_REMOVED: "This comment has already been removed — the list is now up to date.",
  COMMENT_NOT_REMOVED: "This comment isn't removed, so there is nothing to restore.",
  FLAG_NOT_FOUND: "That flag no longer exists.",
  FLAG_ALREADY_IN_STATUS: "This flag is already in that state — the queue is now up to date.",

  // Photo verification. A held photo is the ONE moderation record two people
  // are genuinely likely to reach for at once — the queue is short, the badge
  // calls everyone to it, and the decision is irreversible in both directions.
  PHOTO_ALREADY_REVIEWED:
    "Another admin already decided about this photo, so nothing was changed. The queue has been refreshed with their decision.",
  PHOTO_NOT_FOUND:
    "That photo record no longer exists. The decision row normally outlives the file, so this means the record itself was removed.",

  // Session and permission. Deliberately neutral: an ops admin hitting a
  // super-only action is the system working, not a fault to report.
  ADMIN_MISSING_PERMISSION: "Your role doesn't cover this action. Ask a super admin.",
  ADMIN_NOT_AN_ADMIN: "This account has no console access.",
  ADMIN_NO_SESSION: "Your session has expired. Sign in again, then retry.",
};

/**
 * Codes that mean "the record already moved". The action did not happen, but
 * neither did anything break — the honest response is to refetch so the screen
 * stops disagreeing with the database.
 */
const STALE_CONFLICT_CODES = new Set([
  "REPORT_ALREADY_CLOSED",
  "REPORT_ALREADY_COMPLETED",
  "REPORT_ALREADY_HIDDEN",
  "REPORT_NOT_CLOSED",
  "REPORT_NOT_HIDDEN",
  "REPORT_HIDDEN",
  "REPORT_NOT_FOUND",
  "USER_ALREADY_SUSPENDED",
  "USER_NOT_SUSPENDED",
  "USER_NOT_FOUND",
  "COMMENT_ALREADY_REMOVED",
  "COMMENT_NOT_REMOVED",
  "COMMENT_NOT_FOUND",
  "FLAG_ALREADY_IN_STATUS",
  "FLAG_NOT_FOUND",
  // The 409 the photo endpoints answer when another admin got there first. It
  // is the textbook stale conflict: nothing broke, the record moved, and the
  // only useful response is to refetch so the row stops disagreeing with the
  // database. Classified as a crash it would read as a fault in the console.
  "PHOTO_ALREADY_REVIEWED",
  "PHOTO_NOT_FOUND",
]);

export function moderationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }
    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;
  }
  return getErrorMessage(error);
}

/** True when the refusal means the on-screen record is out of date. */
export function isStaleConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code);
}

/**
 * True when the action was correctly refused and retrying it cannot help.
 * A dialog that keeps offering "Try again" for a permission it will never have
 * is a small lie told repeatedly.
 */
export function isPermanentRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === "CANNOT_SUSPEND_ADMIN" || error.code === "CANNOT_SUSPEND_SELF") return true;
  return error.code === "ADMIN_MISSING_PERMISSION" || error.code === "ADMIN_NOT_AN_ADMIN";
}
