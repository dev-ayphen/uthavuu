/**
 * Why a list did not load — and therefore what the operator should be shown.
 *
 * THE DISTINCTION THIS EXISTS TO PRESERVE
 * ───────────────────────────────────────────────────────────────────────────
 * "The API said no" is not the same as "the API never answered", and neither is
 * the same as "you personally may not see this". Collapsing them into one red
 * "Something went wrong" produces three separate wrong outcomes:
 *
 *   403 ADMIN_MISSING_PERMISSION  An ops admin on a super-only route. The
 *                                 system is working exactly as designed. A red
 *                                 error state invites them to file a bug
 *                                 against correct behaviour.
 *   403 ADMIN_NO_SESSION          The session expired mid-shift. Not an error
 *                                 to read, an interruption to resolve — the
 *                                 only useful response is to sign in again.
 *   status === null               The API is down or unreachable. Blaming the
 *                                 operator's permissions for an outage sends
 *                                 them to the wrong person for an hour.
 *
 * `src/app/(console)/admins/page.tsx` makes this distinction by hand for one
 * route. This module is that behaviour, generalised, so all 13 list pages
 * inherit it instead of each re-deriving it.
 */

import { ApiError, getErrorMessage } from "./api-error";
import { ListShapeError } from "./list-page";

export type ListFailureKind =
  /** Authenticated, is staff, lacks the specific permission. Expected. */
  | "forbidden"
  /** Signed in as a citizen, not a console user. */
  | "not-admin"
  /** No/expired session. A redirect concern, not a message to read. */
  | "signed-out"
  /** Never reached the API at all. */
  | "unreachable"
  /** Everything else: 500s, malformed responses, bugs. */
  | "error";

export type ListFailure = {
  kind: ListFailureKind;
  title: string;
  message: string;
  /** Server-side error id, when the API sent one. The only handle support has. */
  digest?: string;
  /**
   * False where retrying cannot help. Re-running a request that was correctly
   * refused just re-refuses it, and a "Try again" button that can never succeed
   * is a small lie told repeatedly.
   */
  canRetry: boolean;
};

/**
 * Branch on `code`, never on the message. The prose gets reworded; the code is
 * the contract (see the note on `ApiError.code`).
 */
export function classifyListFailure(error: unknown): ListFailure {
  if (error instanceof ListShapeError) {
    return {
      kind: "error",
      title: "That response didn't make sense",
      message: `${error.message} This is a mismatch between the console and the API, not something you did wrong.`,
      canRetry: true,
    };
  }

  if (error instanceof ApiError) {
    if (error.isNetworkFailure) {
      return {
        kind: "unreachable",
        title: "Can't reach the API",
        message:
          "The console couldn't reach the API, so there's nothing to show yet. This isn't a problem with your account or your filters.",
        canRetry: true,
      };
    }

    switch (error.code) {
      case "ADMIN_MISSING_PERMISSION":
        return {
          kind: "forbidden",
          title: "You don't have permission to view this",
          message:
            "Your role covers other parts of the console, but not this one. Ask a super admin if you need access.",
          canRetry: false,
        };
      case "ADMIN_NOT_AN_ADMIN":
        return {
          kind: "not-admin",
          title: "This account isn't a staff account",
          message:
            "You're signed in, but this account has no console access. Ask a super admin to grant it, then sign in again.",
          canRetry: false,
        };
      case "ADMIN_NO_SESSION":
        return {
          kind: "signed-out",
          title: "Your session has expired",
          message: "Sign in again to pick up where you left off.",
          canRetry: false,
        };
      default:
        break;
    }

    // A 403 with no code we recognise is still a refusal, not a crash. Fail
    // toward the explanation that does not accuse the operator of breaking it.
    if (error.status === 403) {
      return {
        kind: "forbidden",
        title: "You don't have permission to view this",
        message: error.message,
        canRetry: false,
      };
    }

    if (error.status === 404) {
      return {
        kind: "error",
        title: "That list doesn't exist yet",
        message:
          "The API doesn't serve this endpoint. If this section was just added, its backend may not be deployed yet.",
        canRetry: true,
      };
    }

    return {
      kind: "error",
      title: "Couldn't load this list",
      message: error.message,
      canRetry: true,
    };
  }

  return {
    kind: "error",
    title: "Couldn't load this list",
    message: getErrorMessage(error),
    canRetry: true,
  };
}

/**
 * True when the correct response is to send the operator to sign in, rather
 * than to render anything at all.
 */
export function isSessionFailure(failure: ListFailure): boolean {
  return failure.kind === "signed-out";
}

/**
 * True for outcomes that are the system working correctly. These render as a
 * calm explanation (an EmptyState), never as a red ErrorState.
 */
export function isExpectedRefusal(failure: ListFailure): boolean {
  return failure.kind === "forbidden" || failure.kind === "not-admin";
}
