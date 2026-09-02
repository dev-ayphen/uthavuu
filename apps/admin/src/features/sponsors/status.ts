import type { SponsorStatus } from "./types";

/**
 * Which of Pause / Activate to offer for a given status — and why the answer is
 * not simply "the opposite of what it says".
 *
 * THE STORED STATUS AND THE DISPLAYED STATUS ARE NOT THE SAME FIELD
 * ───────────────────────────────────────────────────────────────────────────
 * `apps/api/src/sponsors/sponsor-status.ts` is the specification, and it is
 * worth reading before changing anything here. `sponsors.status_id` stores the
 * OPERATOR'S INTENT and holds only three values — `draft`, `active`, `paused`.
 * The other two the console displays are DERIVED from the campaign window at
 * read time and never written:
 *
 *   stored `active` + start date in the future  ->  displays as `scheduled`
 *   stored `active` + end date in the past      ->  displays as `expired`
 *
 * So `scheduled` and `expired` are both stored `active`. A naive rule — "if it
 * doesn't say Active, offer Activate" — would put an Activate button on an
 * expired campaign, where the API can only answer `SPONSOR_ALREADY_ACTIVE`
 * because the stored value is already `active`. The operator would press a
 * button that cannot work, get a refusal that reads as a bug, and still not
 * learn the actual fix: an expired campaign restarts by changing its END DATE,
 * not by activating it.
 *
 * Hence the mapping below is on the STORED value, recovered from the displayed
 * one. This is the one place in the feature that reasons about status at all,
 * and it reasons about which BUTTON to show — never about what the badge says.
 * The badge always renders what the API sent (see `sponsor-status-badge.tsx`).
 *
 * An unknown key falls to `activate`, matching how `isSuperAdmin` treats an
 * unrecognised role: the smaller, more reversible action rather than the
 * larger. Starting a campaign someone must then pause is a lesser harm than
 * hiding the only control that could stop one.
 */

/** The three values `sponsors.status_id` can actually hold. */
export type StoredSponsorStatus = "draft" | "active" | "paused";

/** Displayed status -> the value stored behind it. */
export function storedStatusOf(status: SponsorStatus): StoredSponsorStatus {
  switch (status.key) {
    case "paused":
      return "paused";
    case "draft":
      return "draft";
    // active, scheduled and expired are all stored `active`.
    default:
      return "active";
  }
}

/** Which transition button this status should offer. */
export function primaryTransition(status: SponsorStatus): "pause" | "activate" {
  return storedStatusOf(status) === "active" ? "pause" : "activate";
}
