import { z } from "zod";

import { isoToLocalInput, localInputToIso, localInputToTimestamp } from "./dates";
import type { AdminUpdate, CommunityUpdatePayload } from "./types";

/**
 * The create/edit form's schema, and the two mappers either side of it.
 *
 * WHAT IS MIRRORED FROM THE BACKEND, AND WHAT IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * Every bound below is transcribed from `CommunityUpdateFieldsSchema` in
 * `apps/api/src/admin/dto/create-community-update.dto.ts`. They match it
 * EXACTLY, in both directions — a client rule looser than the server's produces
 * a 400 the operator has to decode, and a client rule STRICTER than the
 * server's silently refuses a save the API would have accepted, which is the
 * harder bug to notice because nothing ever errors.
 *
 *   - English title and body are required, 1..200 and 1..5000.
 *   - Tamil is optional, and when present must be 1..200 / 1..5000 — the API
 *     rejects the empty string rather than storing it, because `''` renders as
 *     a blank card in Tamil where NULL routes through the English fallback.
 *     "No translation" has exactly one spelling, and `formValuesToPayload`
 *     below is what guarantees this form only ever sends that one.
 *   - `expiresAt` must be strictly after `publishAt`. The refinement most
 *     likely to be tripped, because a date picker makes an inverted window a
 *     single mis-click and the failure is invisible afterwards: an update whose
 *     window is backwards is simply never seen by anyone.
 *
 * NOT mirrored, deliberately: nothing here demands a Tamil body just because a
 * Tamil title was typed. The DTO makes the same choice for the same reason
 * ("the fallback is per-field, so a Tamil headline over an English body is a
 * legitimate half-translated state rather than an error to reject"). It is
 * still the worst of the three states, so the form WARNS about it in prose
 * (see UpdateForm) rather than refusing it.
 *
 * NOT mirrored either: the API's `EXPIRES_BEFORE_PUBLISH` re-check against the
 * STORED row. A PATCH sending one date is compared server-side against the
 * other already in the database — something no client schema can see. This form
 * always submits both, so the check below covers what it sends; the server code
 * is still handled, on the field, in `update-errors.ts`.
 *
 * Every field is a string, including the two dates. That is what an
 * `<input>` yields, and keeping the form's shape identical to the DOM's means
 * there is no half-parsed intermediate state to reason about — `null` appears
 * exactly once, in `formValuesToPayload`, on the way out.
 */

// Both from the DTO. Changing either without changing the DTO turns a form
// that looks fine into a 400 at submit time.
const TITLE_MAX = 200;
const BODY_MAX = 5000;

export const updateFormSchema = z
  .object({
    titleEn: z
      .string()
      .trim()
      .min(1, "An English title is required — it is what every citizen falls back to.")
      .max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    bodyEn: z
      .string()
      .trim()
      .min(1, "An English body is required — it is what every citizen falls back to.")
      .max(BODY_MAX, `Keep the body under ${BODY_MAX} characters.`),
    // No `.min()`: blank is the legitimate "no translation" state here, and
    // `formValuesToPayload` turns it into the `null` the API wants. A `.min(1)`
    // mirroring the DTO literally would make Tamil required, inverting the rule.
    titleTa: z.string().trim().max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    bodyTa: z.string().trim().max(BODY_MAX, `Keep the body under ${BODY_MAX} characters.`),
    publishAt: z.string(),
    expiresAt: z.string(),
  })
  .superRefine((values, ctx) => {
    const from = values.publishAt.trim();
    const to = values.expiresAt.trim();

    // A browser that cannot render a native picker falls back to a text box, so
    // an unparseable value is reachable rather than theoretical.
    if (from && localInputToTimestamp(from) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["publishAt"],
        message: "That isn't a date and time the console can read.",
      });
    }
    if (to && localInputToTimestamp(to) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "That isn't a date and time the console can read.",
      });
    }

    const fromMs = localInputToTimestamp(from);
    const toMs = localInputToTimestamp(to);

    // Only compared when BOTH exist. "Ends on the 5th, starts whenever it is
    // published" is a legitimate window, and so is one with no end at all.
    if (fromMs !== null && toMs !== null && toMs <= fromMs) {
      ctx.addIssue({
        code: "custom",
        // On `expiresAt`, not on the form: it is the field the operator most
        // likely mistyped, and an error on the form root leaves them hunting.
        path: ["expiresAt"],
        message: "The announcement has to stop showing AFTER it starts. Check these two dates.",
      });
    }
  });

export type UpdateFormValues = z.infer<typeof updateFormSchema>;

/** Every field a server `validationErrors` entry is allowed to land on. */
export const UPDATE_FIELD_NAMES = [
  "titleEn",
  "bodyEn",
  "titleTa",
  "bodyTa",
  "publishAt",
  "expiresAt",
] as const satisfies readonly (keyof UpdateFormValues)[];

export function isUpdateFieldName(path: string): path is keyof UpdateFormValues {
  return (UPDATE_FIELD_NAMES as readonly string[]).includes(path);
}

/**
 * API record -> form values.
 *
 * EVERY NULLABLE FIELD IS COALESCED TO "". A `null` handed to a React input
 * flips it from controlled to uncontrolled: the warning is easy to miss and the
 * symptom is that the operator's typing is silently dropped. `titleTa`,
 * `bodyTa`, `publishAt` and `expiresAt` are all nullable by contract, so all
 * four go through `?? ""` — never `?? undefined`, which has the same failure.
 */
export function updateToFormValues(record: AdminUpdate | null): UpdateFormValues {
  return {
    titleEn: record?.titleEn ?? "",
    bodyEn: record?.bodyEn ?? "",
    titleTa: record?.titleTa ?? "",
    bodyTa: record?.bodyTa ?? "",
    publishAt: isoToLocalInput(record?.publishAt),
    expiresAt: isoToLocalInput(record?.expiresAt),
  };
}

/**
 * Form values -> API body.
 *
 * Blank goes back as `null`, not `""`. They are different states to this
 * product: `null` means "a Tamil reader sees the English", while `""` would be
 * a Tamil translation that happens to be empty — a citizen shown a blank
 * headline. The same distinction applies to the dates, where `""` is not a
 * timestamp at all.
 */
export function formValuesToPayload(values: UpdateFormValues): CommunityUpdatePayload {
  return {
    titleEn: values.titleEn.trim(),
    bodyEn: values.bodyEn.trim(),
    titleTa: blankToNull(values.titleTa),
    bodyTa: blankToNull(values.bodyTa),
    publishAt: localInputToIso(values.publishAt),
    expiresAt: localInputToIso(values.expiresAt),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
