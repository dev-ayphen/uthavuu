import type { BadgeProps } from "@/components/ui";

/**
 * The lookup tables this section filters on — and the fallback used before the
 * real ones arrive.
 *
 * THESE ARE NO LONGER THE SOURCE OF TRUTH. `GET /admin/support-tickets/catalogue`
 * is (`AdminSupportService.catalogue()`), and `use-ticket-catalogue.ts` reads
 * it. That endpoint exists precisely because a hardcoded filter list drifts
 * silently: the service matches on `eq(key, ...)`, so a key that no longer
 * exists returns 200 with an empty page, which reads as "no tickets in that
 * state" rather than as a broken filter.
 *
 * WHY THE CONSTANTS SURVIVE ANYWAY. They are the first frame and the outage
 * frame, nothing more. The status tabs are this queue's primary navigation; if
 * they were empty until a second request resolved, every arrival at
 * `/platform/support` would flash a bar with no tabs in it, and an API blip
 * would leave an operator with no way to filter at all. Rendering the known
 * five immediately and letting the catalogue replace them costs one stale frame
 * in the worst case and removes a permanent one.
 *
 * So drift is now bounded: it can only affect the moments before the catalogue
 * loads, or a period when it cannot be loaded at all. Anything rendered against
 * a RECORD — every badge on every row — already uses the API's own `label`
 * (see `types.ts`), so a status renamed server-side shows its new name on every
 * row even while this file is stale.
 *
 * WHERE EACH LIST CAME FROM
 * ───────────────────────────────────────────────────────────────────────────
 *  - STATUSES and PRIORITIES: `TICKET_STATUS_KEYS` / `TICKET_PRIORITY_KEYS` in
 *    `apps/api/src/support/ticket-status.ts`, which the API calls "the source of
 *    truth for the code" alongside the seeded rows. Verified key-for-key.
 *  - CATEGORIES: `db/seed.ts`'s `TICKET_CATEGORIES`, unchanged and verified.
 */

export type TicketOption = { value: string; label: string };

/**
 * The lifecycle, in lifecycle order — which is what `sort_order` exists for on
 * the table. Alphabetical would put `closed` first and `waiting_for_user` last,
 * turning a pipeline into a word list.
 */
export const TICKET_STATUS_OPTIONS: readonly TicketOption[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_for_user", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

/**
 * The statuses a Status dropdown may move a ticket INTO.
 *
 * `resolved` and `closed` are deliberately absent. They are the two
 * consequential transitions — one tells the citizen their problem is believed
 * fixed, the other ends the conversation and locks the composer — and both are
 * reachable only through their own confirmed action (`ticket-controls.tsx`).
 * Leaving them in the dropdown would put an unconfirmed, one-click Close beside
 * a confirmed one, and the unconfirmed one would win because it is nearer.
 *
 * The reverse direction stays open: this list IS the reopen path, so a resolved
 * or closed ticket can be dragged back to Open or In Progress from the same
 * control, without a second "Reopen" button meaning the same thing.
 */
export const TICKET_WORKING_STATUS_KEYS: readonly string[] = [
  "open",
  "in_progress",
  "waiting_for_user",
];

export const TICKET_PRIORITY_OPTIONS: readonly TicketOption[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const TICKET_CATEGORY_OPTIONS: readonly TicketOption[] = [
  { value: "technical_problem", label: "Technical Problem" },
  { value: "bug_report", label: "Bug Report" },
  { value: "account_problem", label: "Account Problem" },
  { value: "feature_request", label: "Feature Request" },
  { value: "complaint", label: "Complaint" },
  { value: "other", label: "Other" },
];

/**
 * The sentinel the `assigned` filter uses for "nobody has picked this up".
 *
 * Every other value that filter carries is a real `user.id`, which needs no
 * convention — "assigned to me" is simply this operator's own id. Only the
 * empty case has no id to send.
 *
 * This started as an explicit guess: the frozen contract declared an `assigned`
 * param without its vocabulary. It is no longer one. `ListSupportTicketsSchema`
 * now exports `ASSIGNED_UNASSIGNED = 'unassigned'` and the service branches on
 * it (`isNull(supportTickets.assignedAdminId)`), so the two sides agree by
 * declaration rather than by luck. Kept as one exported constant so they can
 * only ever be changed together.
 */
export const ASSIGNED_UNASSIGNED = "unassigned";

/**
 * Badge colour per lifecycle state. Unknown keys stay neutral rather than
 * guessing — a status this build has never heard of still renders, with its
 * real label, in a colour that claims nothing.
 */
export function statusTone(key: string): NonNullable<BadgeProps["tone"]> {
  switch (key) {
    // Nobody has picked it up yet.
    case "open":
      return "info";
    // Someone is working it.
    case "in_progress":
      return "primary";
    // The ball is with the citizen — not our queue's problem right now, but not
    // finished either. Warning, because it is the state tickets rot in.
    case "waiting_for_user":
      return "warning";
    // Believed fixed; the citizen may still reply.
    case "resolved":
      return "success";
    // Finished. Neutral, not success — closing is not an achievement, and a
    // green "Closed" beside a green "Resolved" makes the two look alike, which
    // is the exact distinction this section works hardest to keep visible.
    case "closed":
      return "neutral";
    default:
      return "neutral";
  }
}

/**
 * Badge colour per priority.
 *
 * `low` and `normal` are both neutral on purpose. Colouring the resting state
 * of every ticket in the queue spends the operator's attention on the rows that
 * least need it, and leaves nothing louder for `urgent`.
 */
export function priorityTone(key: string): NonNullable<BadgeProps["tone"]> {
  switch (key) {
    case "urgent":
      return "danger";
    case "high":
      return "warning";
    case "normal":
    case "low":
      return "neutral";
    default:
      return "neutral";
  }
}

/** True for the one state that stops the conversation. Drives the composer. */
export function isClosed(statusKey: string): boolean {
  return statusKey === "closed";
}
