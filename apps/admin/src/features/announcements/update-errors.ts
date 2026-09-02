import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when `/admin/community-updates` refuses something.
 *
 * The console's shared map lives in `features/moderation/moderation-errors.ts`
 * and covers reports, users, comments and flags. These codes are this section's
 * own, and that file is another feature's surface, so they live here — same
 * shape, same rules, so the two can be merged the day someone owns a shared
 * error catalogue.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE. The API's prose gets reworded; the
 * code is the contract (see `ApiError.code`).
 *
 * Every code below is transcribed from
 * `apps/api/src/admin/admin-community-updates.service.ts` and its two DTOs, not
 * guessed. Most are not failures at all — they are the API saying the record
 * already moved, which is why `isUpdateStaleConflict` exists: the right response
 * to "already published" is to refetch, so the badge on screen stops disagreeing
 * with the database and the operator does not try the same click twice.
 */

const MESSAGES: Record<string, string> = {
  UPDATE_NOT_FOUND:
    "That announcement no longer exists. It may have been deleted while this page was open.",
  UPDATE_ALREADY_PUBLISHED: "This announcement is already published — the page is now up to date.",
  UPDATE_ALREADY_ARCHIVED: "This announcement is already archived — the page is now up to date.",
  // 409 on a PATCH whose every field already holds the value sent. Benign: the
  // operator pressed Save on a form they had not changed. Saying "conflict"
  // would make a no-op sound like a fault.
  NO_EFFECTIVE_CHANGE: "Nothing to save — every field already holds the value shown here.",
  // The empty-PATCH guard. This form always sends all six fields, so reaching
  // this means the payload was built wrong, not that the operator did anything.
  NO_FIELDS_TO_UPDATE: "The console sent an empty change. Nothing was saved — please report this.",
  EXPIRES_BEFORE_PUBLISH:
    "The announcement has to stop showing after it starts. Check both dates — a change to one is still compared against the other, including the value already saved.",
};

/** Codes meaning "the record already moved". Refetch, then show the message. */
const STALE_CONFLICT_CODES = new Set([
  "UPDATE_NOT_FOUND",
  "UPDATE_ALREADY_PUBLISHED",
  "UPDATE_ALREADY_ARCHIVED",
]);

/** The code the API uses for a record that is gone. Feeds `useDetailQuery`. */
export const UPDATE_NOT_FOUND_CODES = ["UPDATE_NOT_FOUND"] as const;

/**
 * `EXPIRES_BEFORE_PUBLISH` arrives as a plain `{ code, message }`, NOT as a Zod
 * `errors[]` array — the service raises it by hand after merging the payload
 * with the stored row, which no DTO can do. So `ApiError.fieldErrors` is empty
 * and the generic field-mapping path would miss it, dropping a per-field
 * problem into the form-level banner. This is the exception that routes it back
 * onto the field the operator most likely mistyped.
 */
export const CODE_TO_FIELD: Record<string, "expiresAt"> = {
  EXPIRES_BEFORE_PUBLISH: "expiresAt",
};

export function updateErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }
    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;
  }
  return getErrorMessage(error);
}

export function isUpdateStaleConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code);
}
