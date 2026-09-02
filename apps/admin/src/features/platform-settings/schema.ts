import { z } from "zod";

import {
  APP_NAME_MAX,
  SUPPORT_EMAIL_MAX,
  SUPPORT_PHONE_MAX,
  MAX_PHOTOS_MAX,
  MAX_PHOTOS_MIN,
  MAX_VOLUNTEERS_MAX,
  MAX_VOLUNTEERS_MIN,
  isRadiusOption,
  type AdminSettings,
  type AdminSettingsPatch,
} from "./types";

/**
 * The App Settings form's schema, and the two mappers either side of it.
 *
 * WHAT IS MIRRORED FROM THE CONTRACT, AND WHAT IS DELIBERATELY NOT
 * ───────────────────────────────────────────────────────────────────────────
 * Every bound below is transcribed from the frozen contract, and matches it in
 * BOTH directions. A client rule looser than the server's produces a 400 the
 * operator has to decode; a client rule STRICTER than the server's silently
 * refuses a save the API would have accepted, which is the harder bug to spot
 * because nothing ever errors — the button simply never works.
 *
 *   appName                 required, 1..80
 *   maxPhotosPerReport      whole number, 1..10
 *   maxVolunteersPerReport  whole number, 1..50
 *   defaultRadiusKm         exactly one of 1 / 3 / 5 / 10
 *   supportEmail            blank, or a valid address up to 200 characters
 *   supportPhone            blank, or up to 32 characters, any format
 *
 * The last two are transcribed from `UpdatePlatformSettingsSchema` in
 * `apps/api/src/admin/dto/update-platform-settings.dto.ts` — the frozen
 * contract typed them only as `string | null`, and the DTO turned out to
 * constrain both. Note what is NOT mirrored: the DTO puts no format rule on the
 * phone, so neither does this. A number that looks wrong is a WARNING in prose
 * (`phoneLooksWrong`, rendered by `settings-form.tsx`), never a refusal — a
 * client rule stricter than the server's silently blocks a save the API would
 * have accepted, which is the harder bug to notice because nothing errors.
 *
 * Blank is a legitimate value for both: the API's `clearableTrimmed` turns an
 * empty string into `null`, which is how a support contact is REMOVED. A
 * `.min(1)` here would make a field the console can set but never clear.
 *
 * NOT IN THIS SCHEMA AT ALL: `maintenanceMode` and `readOnlyMode`. They are
 * app-wide kill switches with their own confirm-gated, single-key PATCH (see
 * `maintenance-controls.tsx`). Putting them in a form with a Save button would
 * mean an operator's half-finished edit to `appName` rides into production on
 * the back of an emergency switch, and that an emergency switch waits on a
 * form validating a field nobody touched.
 *
 * EVERY TEXT FIELD IS A STRING, INCLUDING THE NUMBERS. That is what an
 * `<input>` yields, and keeping the form's shape identical to the DOM's means
 * there is no half-parsed intermediate state to reason about — `null` and
 * `number` appear exactly once each, in `formValuesToPatch`, on the way out.
 */

/**
 * A whole number in a closed range, reported as ONE message.
 *
 * Written as a single predicate rather than chained `.refine`s so a value like
 * "abc" produces one sentence naming the rule, not two competing ones.
 */
function wholeNumberInRange(min: number, max: number) {
  return z
    .string()
    .trim()
    .refine((value) => {
      // Anchored digits only: `Number("")` is 0, `Number(" 4 ")` is 4 and
      // `Number("4e2")` is 400 — all of which would slip past a bare Number()
      // check and save something the operator never typed.
      if (!/^\d+$/.test(value)) return false;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max;
    }, `Enter a whole number from ${min} to ${max}.`);
}

/** Reused rather than rebuilt per keystroke. Matches the DTO's `.email()`. */
const EMAIL = z.email();

export const settingsFormSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1, "The app needs a name — it is what citizens see in the app.")
    .max(APP_NAME_MAX, `Keep the name under ${APP_NAME_MAX} characters.`),
  supportEmail: z
    .string()
    .trim()
    .max(SUPPORT_EMAIL_MAX, `Keep the address under ${SUPPORT_EMAIL_MAX} characters.`)
    // Blank passes: it is how the address is cleared. Anything else has to be
    // an address, because the API's DTO says so.
    .refine(
      (value) => value === "" || EMAIL.safeParse(value).success,
      "Enter a valid email address, or leave it blank to remove it.",
    ),
  supportPhone: z
    .string()
    .trim()
    .max(SUPPORT_PHONE_MAX, `Keep the number under ${SUPPORT_PHONE_MAX} characters.`),
  maxPhotosPerReport: wholeNumberInRange(MAX_PHOTOS_MIN, MAX_PHOTOS_MAX),
  maxVolunteersPerReport: wholeNumberInRange(MAX_VOLUNTEERS_MIN, MAX_VOLUNTEERS_MAX),
  defaultRadiusKm: z
    .string()
    // Not `z.enum`: an off-contract value already stored (say 7 km) has to be
    // able to REACH this form so the operator can see it and correct it. An
    // enum would force the mapper to silently rewrite it to a legal value on
    // the way in, hiding the bad data instead of surfacing it.
    .refine((value) => isRadiusOption(value), "Pick one of the four radii the app offers."),
  allowAnonymousReports: z.boolean(),
  commentsEnabled: z.boolean(),
  commentFlaggingEnabled: z.boolean(),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

/** Every field a server `validationErrors` entry is allowed to land on. */
export const SETTINGS_FIELD_NAMES = [
  "appName",
  "supportEmail",
  "supportPhone",
  "maxPhotosPerReport",
  "maxVolunteersPerReport",
  "defaultRadiusKm",
  "allowAnonymousReports",
  "commentsEnabled",
  "commentFlaggingEnabled",
] as const satisfies readonly (keyof SettingsFormValues)[];

export function isSettingsFieldName(path: string): path is keyof SettingsFormValues {
  return (SETTINGS_FIELD_NAMES as readonly string[]).includes(path);
}

/**
 * API record -> form values.
 *
 * BOTH NULLABLE FIELDS ARE COALESCED TO "". A `null` handed to a React input
 * flips it from controlled to uncontrolled: the warning is easy to miss and the
 * symptom is that the operator's typing is silently dropped. Never `?? undefined`,
 * which fails the same way.
 */
export function settingsToFormValues(settings: AdminSettings): SettingsFormValues {
  return {
    appName: settings.appName ?? "",
    supportEmail: settings.supportEmail ?? "",
    supportPhone: settings.supportPhone ?? "",
    maxPhotosPerReport: String(settings.maxPhotosPerReport ?? ""),
    maxVolunteersPerReport: String(settings.maxVolunteersPerReport ?? ""),
    defaultRadiusKm: String(settings.defaultRadiusKm ?? ""),
    allowAnonymousReports: Boolean(settings.allowAnonymousReports),
    commentsEnabled: Boolean(settings.commentsEnabled),
    commentFlaggingEnabled: Boolean(settings.commentFlaggingEnabled),
  };
}

/**
 * Form values -> PATCH body, NARROWED TO WHAT ACTUALLY CHANGED.
 *
 * The contract accepts any subset, and sending only the dirty keys is what
 * stops this form overwriting a field a second operator changed while it sat
 * open. Sending all nine every time would make the last Save win on fields
 * nobody on this screen even looked at.
 *
 * Blank goes back as `null`, not `""` — they are different states: `null` is
 * "there is no support email", `""` would be a support email that happens to
 * be empty, which renders as a blank contact line in the app.
 */
export function formValuesToPatch(
  values: SettingsFormValues,
  dirtyFields: Partial<Record<keyof SettingsFormValues, boolean | undefined>>,
): AdminSettingsPatch {
  const all = {
    appName: values.appName.trim(),
    supportEmail: blankToNull(values.supportEmail),
    supportPhone: blankToNull(values.supportPhone),
    maxPhotosPerReport: Number(values.maxPhotosPerReport),
    maxVolunteersPerReport: Number(values.maxVolunteersPerReport),
    defaultRadiusKm: Number(values.defaultRadiusKm),
    allowAnonymousReports: values.allowAnonymousReports,
    commentsEnabled: values.commentsEnabled,
    commentFlaggingEnabled: values.commentFlaggingEnabled,
  } satisfies Required<Omit<AdminSettingsPatch, "maintenanceMode" | "readOnlyMode">>;

  const patch: AdminSettingsPatch = {};
  for (const name of SETTINGS_FIELD_NAMES) {
    if (dirtyFields[name]) {
      // Each key is assigned from `all` under the same literal name, so the
      // value type always matches the key. The cast is only because a loop
      // cannot carry that correlation through to the compiler.
      (patch as Record<string, unknown>)[name] = all[name];
    }
  }
  return patch;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A NON-BLOCKING sanity check. It never prevents a save: the API's DTO puts no
 * format rule on the phone, and refusing one here would block something the
 * server accepts. It is still worth saying — the number is printed in front of
 * citizens as something to dial.
 *
 * There is no equivalent for the email, because that one IS a server rule and
 * therefore a real validation error above. A warning and an error for the same
 * field would be two instructions about one box.
 */
export function phoneLooksWrong(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return /[a-z]/i.test(trimmed) || !/\d/.test(trimmed);
}
