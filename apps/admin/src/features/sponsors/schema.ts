import { z } from "zod";

import { DEFAULT_CREATIVE_TYPE, creativeUrlApplies } from "./creative";
import { dateInputToIso, dateInputToTimestamp, isoToDateInput } from "./dates";
import type { AdminSponsor, SponsorPayload } from "./types";

/**
 * The create/edit form's schema, and the two mappers either side of it.
 *
 * WHAT IS MIRRORED FROM THE BACKEND, AND WHAT IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * A client rule LOOSER than the server's produces a 400 the operator has to
 * decode. A client rule STRICTER than the server's silently refuses a save the
 * API would have accepted — the harder bug to notice, because nothing errors,
 * the operator just concludes the field "doesn't work". Both are avoided
 * deliberately, field by field, below.
 *
 * MIRRORED FROM REAL BACKEND CODE (apps/api/src/db/schema/sponsors-schema.ts
 * and apps/api/src/sponsors/sponsor-status.ts, both read directly):
 *
 *   - `name` is the ONLY NOT NULL field of the campaign copy. Everything else
 *     is genuinely optional, and the schema says why: "a sponsor can be entered
 *     from a phone call with nothing but a name and filled in later". So this
 *     form requires exactly one field, and no more.
 *   - `creative_type_id` is NOT NULL, and `logo_text` IS the no-asset state
 *     rather than a null creative type. So the select always has a value.
 *   - THE PAIRING RULE IS NOT A SAVE RULE, AND THIS FORM MUST NOT MAKE IT ONE.
 *     The schema comment says it is "enforced in the DTO"; the DTO as written
 *     does not enforce it, and `admin-sponsors.service.ts` explains why — the
 *     check lives in `activate()`, deliberately: "They are checked at
 *     activation rather than at create/update on purpose: a half-finished DRAFT
 *     is a legitimate state, and blocking Save would stop an operator recording
 *     a sponsor they are still negotiating." An earlier draft of this file made
 *     it a blocking field error, which was the "client stricter than the
 *     server" failure in its purest form: the API would have accepted the save.
 *     It is now a WARNING in the form and a real refusal at activation
 *     (`SPONSOR_CREATIVE_URL_REQUIRED`), which is where the backend puts it.
 *   - `end_date` after `start_date` — sponsor-status.ts refers to "start > end,
 *     which the DTO rejects" while explaining why `expired` is tested before
 *     `scheduled`. This is also the refinement most likely to be tripped: a
 *     date picker makes an inverted window a single mis-click, and the failure
 *     is invisible afterwards, because a campaign whose window is backwards
 *     simply never appears to anyone.
 *   - `placements` are validated against a CLOSED union of four keys. The
 *     schema is explicit that these are "a CONTRACT WITH THE MOBILE APP" and
 *     that the DTO is the only guard, since the database has no CHECK.
 *
 * NOT MIRRORED, DELIBERATELY: a minimum number of placements. A sponsor with
 * none is stored happily by a schema whose only NOT NULL is the name, so
 * refusing it here would block something the API accepts. It is still a
 * campaign that renders nowhere, so the form WARNS in prose (see SponsorForm)
 * rather than refusing. Same call, for the same reason, that the announcements
 * form makes about a half-translated update.
 *
 * THE LENGTH CAPS ARE NOW TRANSCRIBED, NOT PREDICTED. `create-sponsor.dto.ts`
 * has since landed and every bound below matches it exactly: name 200,
 * campaignName 200, location 200, category 80, description 2000, URLs 2048.
 * Two of them were wrong while they were guesses — description was 5000 and
 * category 200, both LOOSER than the DTO, so a long value would have passed the
 * client and come back a 400. That is the cheaper direction to be wrong in, but
 * it is still wrong, and it is why these are worth transcribing rather than
 * estimating.
 *
 * Note the DTO's `nullableText` is `min(1).max(n).nullable()` — the empty
 * string is REJECTED and "absent" must be spelled `null`. That is exactly what
 * `formValuesToPayload`'s `blankToNull` guarantees.
 *
 * Every field is a string or a string array, matching what the DOM yields, so
 * there is no half-parsed intermediate state to reason about. `null` appears
 * exactly once, in `formValuesToPayload`, on the way out.
 */

const NAME_MAX = 200;
const SHORT_TEXT_MAX = 200;
const CATEGORY_MAX = 80;
const DESCRIPTION_MAX = 2000;
/** Practical browser/CDN ceiling. A longer "URL" is a paste accident. */
const URL_MAX = 2048;

/**
 * The four placement keys, transcribed from `SPONSOR_PLACEMENT_KEYS`.
 *
 * Duplicated from `./placements.ts` as a Set for validation rather than
 * imported as the definition, because the two answer different questions: that
 * file decides what the EDITOR OFFERS, this one decides what the FORM ACCEPTS.
 * They agree today. If the API ever returns a fifth key, the editor must not
 * offer a control it cannot describe, but the form must not reject a value the
 * record already legitimately holds — see `sponsorToFormValues`.
 */
const KNOWN_PLACEMENTS = new Set(["home", "community_impact", "impact_stories", "category_list"]);

/**
 * Absolute http(s) only.
 *
 * Stricter than the `text` column, and knowingly so: these three URLs are
 * fetched by a React Native app, which cannot resolve a relative path and will
 * not load a `javascript:` or `data:` URL. A value that cannot work in the app
 * is worth refusing at the point it is typed rather than at the point a citizen
 * sees a blank card. `z.url()` alone would accept `mailto:` and `ftp:`.
 */
function optionalUrl(fieldLabel: string) {
  return z
    .string()
    .trim()
    .max(URL_MAX, "That URL is too long to be real — check it was pasted correctly.")
    .refine(
      (value) => value === "" || isHttpUrl(value),
      `Enter a full ${fieldLabel} starting with https://`,
    );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const sponsorFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "A sponsor name is required — it's the one field the API insists on.")
      .max(NAME_MAX, `Keep the name under ${NAME_MAX} characters.`),
    campaignName: z
      .string()
      .trim()
      .max(SHORT_TEXT_MAX, `Keep the campaign name under ${SHORT_TEXT_MAX} characters.`),
    category: z
      .string()
      .trim()
      .max(CATEGORY_MAX, `Keep the category under ${CATEGORY_MAX} characters.`),
    location: z
      .string()
      .trim()
      .max(SHORT_TEXT_MAX, `Keep the location under ${SHORT_TEXT_MAX} characters.`),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, `Keep the description under ${DESCRIPTION_MAX} characters.`),
    website: optionalUrl("website URL"),
    logoUrl: optionalUrl("logo URL"),
    creativeType: z.string().trim().min(1, "Pick what kind of creative this campaign runs."),
    creativeUrl: optionalUrl("creative URL"),
    placements: z.array(z.string()),
    startDate: z.string(),
    endDate: z.string(),
  })
  .superRefine((values, ctx) => {
    for (const placement of values.placements) {
      if (KNOWN_PLACEMENTS.has(placement)) continue;
      ctx.addIssue({
        code: "custom",
        path: ["placements"],
        message: `"${placement}" isn't a surface the mobile app can render. Clear it and pick again.`,
      });
    }

    const from = values.startDate.trim();
    const to = values.endDate.trim();

    // A browser that cannot render a native picker falls back to a text box, so
    // an unparseable value is reachable rather than theoretical.
    if (from && dateInputToTimestamp(from) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "That isn't a date the console can read.",
      });
    }
    if (to && dateInputToTimestamp(to) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "That isn't a date the console can read.",
      });
    }

    const fromMs = dateInputToTimestamp(from);
    const toMs = dateInputToTimestamp(to);

    // Only compared when BOTH exist. The two nulls are legitimate and mean
    // different things (schema: start null -> live the moment it is activated,
    // end null -> runs until somebody pauses it), so neither is required.
    if (fromMs !== null && toMs !== null && toMs <= fromMs) {
      ctx.addIssue({
        code: "custom",
        // On `endDate`, not on the form root: it is the field the operator most
        // likely mistyped, and an error on the root leaves them hunting.
        path: ["endDate"],
        message: "The campaign has to end after it starts. Check these two dates.",
      });
    }
  });

export type SponsorFormValues = z.infer<typeof sponsorFormSchema>;

/**
 * A video/banner campaign with no creative URL.
 *
 * NOT a validation error — see the note above. The API stores this happily and
 * refuses only at activation, so the form says so and still saves. Returning a
 * boolean rather than adding an issue is what keeps those two facts aligned.
 */
export function creativeUrlMissing(values: {
  creativeType: string;
  creativeUrl: string;
}): boolean {
  return creativeUrlApplies(values.creativeType) && values.creativeUrl.trim() === "";
}

/** Every field a server `validationErrors` entry is allowed to land on. */
export const SPONSOR_FIELD_NAMES = [
  "name",
  "campaignName",
  "category",
  "location",
  "description",
  "website",
  "logoUrl",
  "creativeType",
  "creativeUrl",
  "placements",
  "startDate",
  "endDate",
] as const satisfies readonly (keyof SponsorFormValues)[];

export function isSponsorFieldName(path: string): path is keyof SponsorFormValues {
  return (SPONSOR_FIELD_NAMES as readonly string[]).includes(path);
}

/**
 * API record -> form values.
 *
 * EVERY NULLABLE FIELD IS COALESCED TO "". A `null` handed to a React input
 * flips it from controlled to uncontrolled: the warning is easy to miss and the
 * symptom is that the operator's typing is silently dropped. Nine of the twelve
 * fields are nullable by contract, so all nine go through `?? ""` — never
 * `?? undefined`, which has the same failure.
 *
 * `placements` is copied through UNFILTERED, including any key this build does
 * not recognise. Dropping an unknown key here would let an operator open a
 * sponsor, change its end date, press Save, and silently delete a placement
 * they never saw and never touched. The schema surfaces it as a validation
 * error instead, so removing it is a decision somebody makes on purpose.
 */
export function sponsorToFormValues(record: AdminSponsor | null): SponsorFormValues {
  return {
    name: record?.name ?? "",
    campaignName: record?.campaignName ?? "",
    category: record?.category ?? "",
    location: record?.location ?? "",
    description: record?.description ?? "",
    website: record?.website ?? "",
    logoUrl: record?.logoUrl ?? "",
    // A new sponsor starts on the no-asset creative type, so a name-only
    // record saves without tripping the pairing rule — see DEFAULT_CREATIVE_TYPE.
    creativeType: record?.creativeType.key ?? DEFAULT_CREATIVE_TYPE,
    creativeUrl: record?.creativeUrl ?? "",
    placements: record?.placements ? [...record.placements] : [],
    startDate: isoToDateInput(record?.startDate),
    endDate: isoToDateInput(record?.endDate),
  };
}

/**
 * Form values -> API body.
 *
 * Blank goes back as `null`, not `""`. They are different states to this
 * product: `null` is "no website recorded", while `""` would be a website whose
 * address is the empty string — a link the mobile app would render and that
 * would go nowhere. The same distinction applies to the dates, where `""` is
 * not a timestamp at all, and it is load-bearing for the schedule: a null start
 * date means "live the moment it is activated", which is a real setting, not a
 * missing one.
 *
 * `creativeUrl` is cleared for `logo_text` rather than carried along. That type
 * composes its card from the logo and description; leaving a stale URL on the
 * record would mean switching a campaign to Logo + text and back silently
 * restored a creative the operator believed they had removed.
 */
export function formValuesToPayload(values: SponsorFormValues): SponsorPayload {
  const creativeType = values.creativeType.trim();

  return {
    name: values.name.trim(),
    campaignName: blankToNull(values.campaignName),
    category: blankToNull(values.category),
    location: blankToNull(values.location),
    description: blankToNull(values.description),
    website: blankToNull(values.website),
    logoUrl: blankToNull(values.logoUrl),
    creativeType,
    creativeUrl: creativeUrlApplies(creativeType) ? blankToNull(values.creativeUrl) : null,
    placements: [...values.placements],
    startDate: dateInputToIso(values.startDate),
    endDate: dateInputToIso(values.endDate),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
