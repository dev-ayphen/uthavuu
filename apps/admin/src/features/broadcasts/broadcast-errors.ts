import { ApiError, getErrorMessage } from "@/lib/api-error";

/**
 * What to tell an operator when `/admin/broadcasts` refuses something.
 *
 * BRANCH ON THE CODE, NEVER ON THE MESSAGE. The API's prose gets reworded; the
 * code is the contract (see `ApiError.code`).
 *
 * Every code below is transcribed from `AdminBroadcastsService` and its DTOs —
 * `assertMutable`, `assertSendable`, `cancel()`, `delete()`, `update()` — not
 * guessed. Most are not failures at all: they are the API saying the record
 * already moved, which is what `isBroadcastStaleConflict` drives. The right
 * response to "already sent" is to refetch, so the badge on screen stops
 * disagreeing with the database and the operator does not press Send twice.
 *
 * The API's own sentences are unusually good here and several of them carry
 * the product rule in them ("re-sending would notify everyone who already
 * received it a second time"). Where that is true, the override below stays
 * close to it rather than flattening it into console-speak.
 */

const MESSAGES: Record<string, string> = {
  BROADCAST_NOT_FOUND:
    "That broadcast no longer exists. It may have been deleted while this page was open.",

  // Terminal, and the whole product rule of this feature. Retrying cannot help.
  BROADCAST_ALREADY_SENT:
    "This broadcast has already gone out. Sending is irreversible — it can't be edited, re-sent, cancelled or deleted. Write a new broadcast if you need to correct it.",

  // A fan-out is in flight, OR one died partway and left the row claiming it is
  // still running. The console cannot tell those apart, and says so rather than
  // inviting a retry that would double-notify everyone already reached.
  BROADCAST_SEND_IN_PROGRESS:
    "This broadcast is already being sent. If it stays in this state, its fan-out didn't finish — some people already have it, so it needs a human decision rather than a retry.",

  BROADCAST_CANCELLED:
    "This broadcast was cancelled. Cancelling is terminal — write a new one rather than reviving this.",

  // `sending` on a PATCH: changing the wording mid-fan-out would deliver two
  // different messages under one broadcast.
  BROADCAST_IMMUTABLE: "This broadcast can no longer be edited.",

  BROADCAST_NOT_SCHEDULED:
    "Only a scheduled broadcast can be cancelled. Delete it instead if it's still a draft.",

  BROADCAST_NOT_DELETABLE:
    "Only a draft can be deleted. Cancel a scheduled broadcast first, so the decision not to send it is recorded on its own.",

  // 400, raised by hand against the MERGED row — see CODE_TO_FIELD below.
  BROADCAST_AUDIENCE_MISMATCH:
    "A district broadcast needs a district, and an everyone broadcast must not carry one. Check both fields — changing only one of them is still compared against the other.",

  // 409 on a PATCH whose every field already holds the value sent. Benign: the
  // operator pressed Save on a form they had not changed. Saying "conflict"
  // would make a no-op sound like a fault.
  NO_EFFECTIVE_CHANGE: "Nothing to save — every field already holds the value shown here.",
};

/**
 * Codes meaning "the record already moved". The action did not happen, but
 * nothing broke either: refetch so the screen stops disagreeing with the
 * database, then show the message.
 *
 * Every status refusal is in here, because every one of them is a statement
 * about a status the console is currently rendering — and rendering a stale
 * status next to a Send button is the single most expensive mistake this page
 * can make.
 */
const STALE_CONFLICT_CODES = new Set([
  "BROADCAST_NOT_FOUND",
  "BROADCAST_ALREADY_SENT",
  "BROADCAST_SEND_IN_PROGRESS",
  "BROADCAST_CANCELLED",
  "BROADCAST_IMMUTABLE",
  "BROADCAST_NOT_SCHEDULED",
  "BROADCAST_NOT_DELETABLE",
]);

/**
 * Refusals that will never become an acceptance, however many times they are
 * retried. A dialog that keeps offering "Send anyway" for a broadcast that has
 * already reached people is a small lie told repeatedly — and here the lie has
 * a cost, because the operator's next move is to look for another way to do it.
 *
 * Deliberately narrower than `STALE_CONFLICT_CODES`: `BROADCAST_NOT_SCHEDULED`
 * and `BROADCAST_NOT_DELETABLE` describe a status that can still change, so
 * they refetch without disabling anything.
 */
const PERMANENT_REFUSAL_CODES = new Set([
  "BROADCAST_ALREADY_SENT",
  "BROADCAST_CANCELLED",
  "ADMIN_MISSING_PERMISSION",
  "ADMIN_NOT_AN_ADMIN",
]);

/** The code the API uses for a record that is gone. Feeds `useDetailQuery`. */
export const BROADCAST_NOT_FOUND_CODES = ["BROADCAST_NOT_FOUND"] as const;

/**
 * `BROADCAST_AUDIENCE_MISMATCH` arrives as a plain `{ code, message }`, NOT as
 * a Zod `errors[]` array, whenever the service raises it — which it does after
 * merging the payload with the STORED row, work no DTO can do. So
 * `ApiError.fieldErrors` is empty and the generic field-mapping path would miss
 * it, dropping a per-field problem into the form-level banner. This routes it
 * back onto the field an operator can actually act on.
 *
 * (The same code also arrives from the DTO's own `.refine()`, and that one DOES
 * carry `path: ["district"]`, so it lands on the field either way.)
 */
export const CODE_TO_FIELD: Record<string, "district"> = {
  BROADCAST_AUDIENCE_MISMATCH: "district",
};

export function broadcastErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return "The console couldn't reach the API, so nothing was changed. Check that it's running and try again.";
    }
    const known = error.code === null ? undefined : MESSAGES[error.code];
    if (known) return known;
  }
  return getErrorMessage(error);
}

export function isBroadcastStaleConflict(error: unknown): boolean {
  return (
    error instanceof ApiError && error.code !== null && STALE_CONFLICT_CODES.has(error.code)
  );
}

export function isBroadcastPermanentRefusal(error: unknown): boolean {
  return (
    error instanceof ApiError && error.code !== null && PERMANENT_REFUSAL_CODES.has(error.code)
  );
}
