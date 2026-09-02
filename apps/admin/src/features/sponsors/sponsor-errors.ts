import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when `/admin/sponsors` refuses something.
 *
 * EVERY CODE BELOW IS TRANSCRIBED FROM `admin-sponsors.service.ts`.
 * ───────────────────────────────────────────────────────────────────────────
 * They were predicted for a few hours while the service did not exist, and the
 * guesses were mostly right — but not entirely: the real code is
 * `SPONSOR_CREATIVE_URL_REQUIRED`, not `CREATIVE_URL_REQUIRED`, and two codes
 * that matter (`SPONSOR_NOT_ACTIVE`, `SPONSOR_NO_PLACEMENTS`) were not guessed
 * at all. `INVALID_PLACEMENT` was invented and does not exist — an unknown
 * placement is caught by `z.enum` in the DTO and arrives as an ordinary Zod
 * field error instead.
 *
 * The design that made those wrong guesses harmless is worth keeping: an
 * unrecognised code falls through to `getErrorMessage`, which surfaces the
 * API's OWN prose. A code this map has not heard of degrades to the backend's
 * real sentence rather than to silence or a wrong explanation.
 *
 * TWO OF THESE ARE READINESS REFUSALS, NOT STALE STATE, and the distinction
 * decides whether refetching helps. `SPONSOR_NO_PLACEMENTS` and
 * `SPONSOR_CREATIVE_URL_REQUIRED` mean the campaign is not ready to run —
 * refetching changes nothing, the operator has to go and edit the sponsor. Only
 * the "already/not in that state" codes belong in STALE_CONFLICT_CODES.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE. The API's prose gets reworded; the
 * code is the contract (see `ApiError.code`).
 */

const MESSAGES: Record<string, string> = {
  SPONSOR_NOT_FOUND:
    "That sponsor no longer exists. It may have been deleted while this page was open.",
  SPONSOR_ALREADY_ACTIVE: "This campaign is already running — the page is now up to date.",
  SPONSOR_ALREADY_PAUSED: "This campaign is already paused — the page is now up to date.",
  // Raised by pause() when the stored status is `draft`. A draft was never
  // running, so there is nothing to stop — the useful action is Activate.
  SPONSOR_NOT_ACTIVE:
    "Only a running campaign can be paused. This one is still a draft — activate it first if you want it to run.",
  // Both raised by activate(), which is the ONLY place the readiness rules are
  // checked. Saving an incomplete draft is deliberately allowed.
  SPONSOR_NO_PLACEMENTS:
    "This campaign has no placements, so activating it would run an advertisement that appears on no screen. Add at least one placement first.",
  SPONSOR_CREATIVE_URL_REQUIRED:
    "This campaign's creative type needs a creative URL before it can run — without one the card renders blank. Add the asset URL, or switch the creative type to Logo + text.",
  // 409 on a PATCH whose every field already holds the value sent. Benign: the
  // operator pressed Save on a form they had not changed. Saying "conflict"
  // would make a no-op sound like a fault.
  NO_EFFECTIVE_CHANGE: "Nothing to save — every field already holds the value shown here.",
  END_BEFORE_START:
    "The campaign has to end after it starts. Check both dates — a change to one is still compared against the other, including the value already saved.",
};

/** Codes meaning "the record already moved". Refetch, then show the message. */
const STALE_CONFLICT_CODES = new Set([
  "SPONSOR_NOT_FOUND",
  "SPONSOR_ALREADY_ACTIVE",
  "SPONSOR_ALREADY_PAUSED",
  "SPONSOR_NOT_ACTIVE",
]);

/** The code the API uses for a record that is gone. Feeds `useDetailQuery`. */
export const SPONSOR_NOT_FOUND_CODES = ["SPONSOR_NOT_FOUND"] as const;

/**
 * Codes that are really about ONE field, routed back onto it.
 *
 * `END_BEFORE_START` is the only one, and it needs this because the service
 * raises it as a bare `BadRequestException({ code, message })` after merging
 * the incoming payload with the stored row — work no DTO can do, since a PATCH
 * may send one date to be compared against the other already in the database.
 * There is no `errors[]` array to read, so without this branch a per-field
 * problem would land in the form-level banner with the operator left to work
 * out which of the two dates to change.
 *
 * `SPONSOR_CREATIVE_URL_REQUIRED` is deliberately NOT here. It is raised by
 * `activate()`, never by a save, so it can only ever surface inside the
 * activation dialog — mapping it to a form field would be mapping it to a form
 * that is not on screen.
 */
export const CODE_TO_FIELD: Record<string, "endDate"> = {
  END_BEFORE_START: "endDate",
};

export function sponsorErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }
    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;
  }
  return getErrorMessage(error);
}

export function isSponsorStaleConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code);
}
