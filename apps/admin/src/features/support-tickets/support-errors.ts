import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when `/admin/support-tickets` refuses something.
 *
 * Same shape and same rules as `features/announcements/update-errors.ts` and
 * `features/moderation/moderation-errors.ts` — those cover other sections'
 * codes, so this section keeps its own, ready to merge the day someone owns a
 * shared error catalogue.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE. The API's prose gets reworded; the
 * code is the contract (see `ApiError.code`).
 *
 * EVERY CODE BELOW IS TRANSCRIBED FROM `AdminSupportService`, not guessed —
 * they are the complete set that service raises. Most are not failures at all:
 * they are the API saying the record already moved, or that there was nothing
 * to do, which is why `isTicketStaleConflict` exists. The right response to
 * "already in that status" is to refetch, so the control on screen stops
 * disagreeing with the database and the operator does not try the same click
 * twice.
 *
 * An unrecognised code still surfaces honestly — it falls through to the API's
 * own message, which is prose written for a human. This map exists only to say
 * something BETTER than the API can from where it stands, chiefly to stop a
 * benign 409 reading as a fault.
 */

const MESSAGES: Record<string, string> = {
  TICKET_NOT_FOUND:
    "That ticket no longer exists. It may have been deleted while this page was open.",

  // 409 from `update()`: every field in the PATCH already holds the value sent.
  // Benign — an agent re-picked the option that was already selected. Calling
  // that a conflict would make a no-op sound like a fault.
  TICKET_UNCHANGED: "Nothing to change — the ticket already holds the value shown here.",
  // 409 from the older status-only route, for the same situation.
  TICKET_ALREADY_IN_STATUS: "This ticket is already in that status — the page is now up to date.",

  // 409 from `addMessage()` via `acceptsMessages()`. The one refusal here that
  // is really a lifecycle rule: a closed ticket takes no messages from EITHER
  // side, so this names the way back rather than just saying no.
  TICKET_CLOSED:
    "This ticket is closed, so no new message can be added. Set the status back to Open or In Progress to continue the conversation.",

  // 400s from the three lookup resolutions. If an operator ever sees one of
  // these, the console offered a key the database does not have — which means
  // the catalogue fallback in `./catalogue.ts` is being used and has drifted.
  // That is a deploy problem, not the operator's, and the copy says so.
  UNKNOWN_TICKET_STATUS:
    "The console offered a status the API doesn't recognise. Nothing was changed — please report this.",
  UNKNOWN_TICKET_PRIORITY:
    "The console offered a priority the API doesn't recognise. Nothing was changed — please report this.",
  UNKNOWN_TICKET_CATEGORY:
    "The console offered a category the API doesn't recognise. Nothing was changed — please report this.",

  // 400 from the assignment path: the target user is not (or is no longer) an
  // admin. Reachable in normal use — someone's console access can be revoked
  // while this page is open, and the directory in hand is up to ten minutes old.
  NOT_AN_ADMIN:
    "That person no longer has console access, so the ticket can't be assigned to them. Reload the page to refresh the admin list.",
};

/**
 * Codes meaning "the record on screen is out of date". Refetch, then show the
 * message — leaving a stale control visible is how an operator tries the same
 * thing twice and gets the same refusal.
 *
 * `NOT_AN_ADMIN` is deliberately NOT here: the ticket did not move, the
 * DIRECTORY did, and that is a separate query with its own ten-minute
 * staleness. Invalidating the ticket would refetch the wrong thing and look
 * like it had fixed something.
 */
const STALE_CONFLICT_CODES = new Set([
  "TICKET_NOT_FOUND",
  "TICKET_UNCHANGED",
  "TICKET_ALREADY_IN_STATUS",
  "TICKET_CLOSED",
]);

/** The code meaning "no such ticket". Feeds `useDetailQuery`'s not-found branch. */
export const TICKET_NOT_FOUND_CODES = ["TICKET_NOT_FOUND"] as const;

export function supportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }

    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;

    // A 404 CARRYING NO CODE IS A MISSING ENDPOINT, NOT A MISSING TICKET.
    //
    // `TICKET_NOT_FOUND` is a coded 404 and is answered above, so anything
    // reaching here 404'd without the API recognising the request at all —
    // which for an ACTION means the route is not being served. That is a real
    // state, not a hypothetical: the reply, resolve, close and PATCH routes
    // exist in `AdminSupportController` but a process still running the
    // previous build answers 404 for all four until it restarts.
    //
    // Without this branch an agent gets Nest's raw "Cannot POST
    // /admin/support-tickets/…/messages", concludes the ticket is broken, and
    // retypes their reply. The distinction is the same one `classifyListFailure`
    // already draws for lists ("that list doesn't exist yet"); this is its
    // counterpart for a write.
    if (error.status === 404) {
      return "The API doesn't serve this action yet — nothing was changed, and what you typed is still here. If support tickets were just rebuilt, the API may need restarting to pick up the new routes.";
    }
  }
  return getErrorMessage(error);
}

export function isTicketStaleConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code);
}
