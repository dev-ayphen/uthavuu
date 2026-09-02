import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when `/admin/report-categories` refuses something.
 *
 * The console's shared map lives in `features/moderation/moderation-errors.ts`
 * and covers reports, users, comments and flags. These codes are this section's
 * own, and that file is another feature's surface, so they live here — same
 * shape, same rules, so the two can be merged the day someone owns a shared
 * error catalogue. `features/announcements/update-errors.ts` made the same call.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE. The API's prose gets reworded; the
 * code is the contract (see `ApiError.code`). Every code below was produced by
 * the running API during this work, not read off the service and hoped for.
 */

const MESSAGES: Record<string, string> = {
  CATEGORY_NOT_FOUND:
    "That category no longer exists. It may have been deleted while this page was open.",
  // 400 on a PATCH whose every field already holds the value sent. Benign: the
  // operator pressed Save on a dialog they had not changed. Calling it a
  // validation failure would make a no-op sound like a fault.
  NO_EFFECTIVE_CHANGE: "Nothing to save — every field already holds the value shown here.",

  // ─────────────────────────────────────────────────────────────────────────
  // DELIBERATELY ABSENT: CATEGORY_IN_USE and CATEGORY_KEY_TAKEN.
  //
  // Both arrive with a message this console cannot improve on, because both
  // messages carry a LIVE FACT no static string here could know. CATEGORY_IN_USE
  // names the exact number of reports blocking the delete and then names the
  // alternative ("set citizenSelectable to false"); CATEGORY_KEY_TAKEN quotes
  // the key that collided. Replacing either with a fixed sentence would throw
  // away the only part an operator can act on. They fall through to
  // `getErrorMessage`, which returns the API's own prose.
  // ─────────────────────────────────────────────────────────────────────────
};

/**
 * Codes meaning "the record already moved". The action did not happen, but
 * neither did anything break — the honest response is to refetch so the table
 * stops disagreeing with the database, which is how an operator ends up trying
 * the same thing twice.
 */
const STALE_CONFLICT_CODES = new Set(["CATEGORY_NOT_FOUND"]);

/** The code the API uses for a category that is gone. */
export const CATEGORY_NOT_FOUND_CODES = ["CATEGORY_NOT_FOUND"] as const;

/**
 * `CATEGORY_KEY_TAKEN` is a 409 carrying a plain `{ code, message }`, NOT a Zod
 * `errors[]` array — the service checks for the collision by hand before the
 * insert, so `ApiError.fieldErrors` is empty and the generic field-mapping path
 * would miss it entirely, dropping a problem with ONE field into the form-level
 * banner. This routes it back onto the field the operator has to change.
 */
export const CODE_TO_FIELD: Record<string, "key"> = {
  CATEGORY_KEY_TAKEN: "key",
};

export function categoryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }

    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;

    // A Zod refinement with no field path — `UpdateReportCategorySchema`'s
    // empty-body guard is the only one that can reach here — arrives as
    // `{ statusCode: 400, message: "Validation failed", errors: [{ path: [] }] }`.
    // `ApiError` cannot flatten a pathless issue onto a field, so `code` is null
    // and `fieldErrors` is empty, and the operator would be shown the bare
    // words "Validation failed". This dialog always submits every field, so
    // reaching this state means the payload was built wrong rather than that
    // the operator did anything — say so, instead of implying they typed
    // something bad into a field the console cannot point at.
    if (error.status === 400 && error.code === null && error.fieldErrors.length === 0) {
      return "The console sent a change the API couldn't read. Nothing was saved — please report this.";
    }
  }

  return getErrorMessage(error);
}

/** True when the refusal means the on-screen row is out of date. */
export function isCategoryStaleConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code);
}
