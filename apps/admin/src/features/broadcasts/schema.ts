import { z } from "zod";

import {
  isoToLocalInput,
  localInputToIso,
  localInputToTimestamp,
} from "@/features/announcements/dates";
import type { AdminBroadcast, BroadcastAudienceKey, BroadcastPayload } from "./types";

/**
 * The compose/edit form's schema, and the two mappers either side of it.
 *
 * WHY THE DATE HELPERS ARE IMPORTED AND NOT COPIED
 * ───────────────────────────────────────────────────────────────────────────
 * `features/announcements/dates.ts` converts `<input type="datetime-local">`
 * to and from ISO, pinned to IST — because the console's shared `formatDate`
 * is pinned to `Asia/Kolkata`, and a form on the browser's zone would make an
 * operator type 09:00 and read 14:30 back from the table. That rule is a
 * property of THIS CONSOLE, not of announcements, and a second copy of it is a
 * second thing to be wrong the day India stops observing a fixed +05:30.
 * Announcements already imports four modules out of `features/moderation` on
 * the same reasoning. The right long-term home is `src/lib/`, which is outside
 * this work's scope — flagged in the handover rather than done here.
 *
 * WHAT IS MIRRORED FROM THE BACKEND, AND WHAT IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * Every bound below is transcribed from `BroadcastFieldsSchema` in
 * `apps/api/src/admin/dto/create-broadcast.dto.ts` and matches it EXACTLY, in
 * both directions. A client rule LOOSER than the server's produces a 400 the
 * operator has to decode; a client rule STRICTER than the server's silently
 * refuses a save the API would have accepted, which is the harder bug to
 * notice because nothing ever errors.
 *
 *   - English title and body are required, 1..200 and 1..2000.
 *     NOTE THE BODY LIMIT: 2000, not the 5000 announcements allows. Copying
 *     the sibling feature's number would have been wrong by 3000 characters.
 *   - Tamil is optional; when present, 1..200 / 1..2000. The API rejects the
 *     empty string rather than storing it, because `''` renders as a BLANK
 *     notification in Tamil where NULL routes through the English fallback.
 *     "No translation" has exactly one spelling, and `formValuesToPayload` is
 *     what guarantees this form only ever sends that one.
 *   - `district` is required if and only if the audience is `district`, and is
 *     1..120. This is the refinement that matters most in the whole feature:
 *     a `district` audience with no district would fan out to EVERY USER IN THE
 *     COUNTRY, unrecoverably.
 *
 * NOT mirrored, deliberately: nothing here demands a Tamil body just because a
 * Tamil title was typed. The DTO makes the same choice for the same reason —
 * the fallback is per FIELD, so a Tamil headline over an English body is a
 * legitimate half-translated state. It is still the worst of the three, so the
 * form WARNS about it in prose rather than refusing it.
 *
 * NOT mirrored either: the API's re-check of the audience/district pair against
 * the STORED row. A PATCH changing one half is compared server-side against the
 * other — something no client schema can see. This form always submits both, so
 * the rule below covers what it sends; the server's `BROADCAST_AUDIENCE_MISMATCH`
 * is still routed onto the field in `broadcast-errors.ts`.
 *
 * Every field is a string, including the date. That is what an `<input>`
 * yields, and keeping the form's shape identical to the DOM's means there is no
 * half-parsed intermediate state to reason about — `null` appears exactly once,
 * in `formValuesToPayload`, on the way out.
 */

// All three from the DTO. Changing one without changing the DTO turns a form
// that looks fine into a 400 at submit time.
const TITLE_MAX = 200;
const BODY_MAX = 2000;
const DISTRICT_MAX = 120;

export const broadcastFormSchema = z
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
    // No `.min()`: blank is the legitimate "no translation" state, and
    // `formValuesToPayload` turns it into the `null` the API wants. A `.min(1)`
    // mirroring the DTO literally would make Tamil required, inverting the rule.
    titleTa: z.string().trim().max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    bodyTa: z.string().trim().max(BODY_MAX, `Keep the body under ${BODY_MAX} characters.`),
    // A closed enum, matching the DTO. See the note on `BroadcastAudienceKey`:
    // an audience the fan-out does not implement selects nobody and reports
    // success, so this one is not allowed to be a free string.
    audience: z.enum(["all_users", "district"]),
    // Bounds live in the refinement below rather than here, because they apply
    // only when the field is the one being used. A stale district string left
    // behind by switching the audience to "everyone" is never sent (see
    // `formValuesToPayload`) and must not block a save over a hidden input.
    district: z.string(),
    scheduledAt: z.string(),
  })
  .superRefine((values, ctx) => {
    const district = values.district.trim();

    if (values.audience === "district") {
      if (district === "") {
        ctx.addIssue({
          code: "custom",
          path: ["district"],
          message:
            "Name the district this goes to. Without one, the API would refuse to send rather than fall back to everybody.",
        });
      } else if (district.length > DISTRICT_MAX) {
        ctx.addIssue({
          code: "custom",
          path: ["district"],
          message: `Keep the district under ${DISTRICT_MAX} characters.`,
        });
      }
    }

    // A browser that cannot render a native picker falls back to a text box, so
    // an unparseable value is reachable rather than theoretical.
    const scheduledAt = values.scheduledAt.trim();
    if (scheduledAt && localInputToTimestamp(scheduledAt) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledAt"],
        message: "That isn't a date and time the console can read.",
      });
    }
  });

export type BroadcastFormValues = z.infer<typeof broadcastFormSchema>;

/** Every field a server `validationErrors` entry is allowed to land on. */
export const BROADCAST_FIELD_NAMES = [
  "titleEn",
  "bodyEn",
  "titleTa",
  "bodyTa",
  "audience",
  "district",
  "scheduledAt",
] as const satisfies readonly (keyof BroadcastFormValues)[];

export function isBroadcastFieldName(path: string): path is keyof BroadcastFormValues {
  return (BROADCAST_FIELD_NAMES as readonly string[]).includes(path);
}

/**
 * API record -> form values.
 *
 * EVERY NULLABLE FIELD IS COALESCED TO "". A `null` handed to a React input
 * flips it from controlled to uncontrolled: the warning is easy to miss and the
 * symptom is that the operator's typing is silently dropped. `titleTa`,
 * `bodyTa`, `district` and `scheduledAt` are all nullable by contract, so all
 * four go through `?? ""` — never `?? undefined`, which has the same failure.
 *
 * `audience` falls back to `all_users` only for a NEW broadcast. An existing
 * record always carries one, and if the API ever returns a key this build does
 * not know, defaulting silently to "everybody" would be the most dangerous
 * possible guess — so an unrecognised key is narrowed to `district`, the
 * audience that cannot fan out without an explicit target.
 */
export function broadcastToFormValues(record: AdminBroadcast | null): BroadcastFormValues {
  return {
    titleEn: record?.titleEn ?? "",
    bodyEn: record?.bodyEn ?? "",
    titleTa: record?.titleTa ?? "",
    bodyTa: record?.bodyTa ?? "",
    audience: readAudience(record),
    district: record?.district ?? "",
    scheduledAt: isoToLocalInput(record?.scheduledAt),
  };
}

function readAudience(record: AdminBroadcast | null): BroadcastAudienceKey {
  if (!record) return "all_users";
  if (record.audience.key === "all_users") return "all_users";
  // Anything else — including a third audience seeded server-side that this
  // build has never heard of — is treated as targeted rather than universal.
  // Fail towards the smaller blast radius.
  return "district";
}

/**
 * Form values -> API body.
 *
 * Blank goes back as `null`, not `""`. They are different states to this
 * product: `null` means "a Tamil reader sees the English", while `""` would be
 * a Tamil translation that happens to be empty — a citizen shown a blank
 * notification. The same distinction applies to the schedule, where `""` is not
 * a timestamp at all.
 *
 * `district` is nulled whenever the audience is not `district`, which is what
 * makes it safe for the form to KEEP a typed district in state while the field
 * is hidden: switching to "everybody" and back does not lose the operator's
 * typing, and the value that was hidden can never reach the wire. The API
 * enforces the same rule from the other side and would reject it anyway
 * (`BROADCAST_AUDIENCE_MISMATCH`); this just means the operator never sees that
 * error for something they did not do.
 */
export function formValuesToPayload(values: BroadcastFormValues): BroadcastPayload {
  return {
    titleEn: values.titleEn.trim(),
    bodyEn: values.bodyEn.trim(),
    titleTa: blankToNull(values.titleTa),
    bodyTa: blankToNull(values.bodyTa),
    audience: values.audience,
    district: values.audience === "district" ? blankToNull(values.district) : null,
    scheduledAt: localInputToIso(values.scheduledAt),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
