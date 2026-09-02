import { z } from "zod";

import type {
  CreateReportCategoryPayload,
  ReportCategoryRow,
  UpdateReportCategoryPayload,
} from "./types";

/**
 * The create/edit form's schema, and the mappers either side of it.
 *
 * WHAT IS MIRRORED FROM THE BACKEND, AND WHY EXACTLY
 * ───────────────────────────────────────────────────────────────────────────
 * Every bound below is transcribed from `CreateReportCategorySchema` in
 * `apps/api/src/admin/dto/create-report-category.dto.ts`. They match it
 * EXACTLY, in both directions — a client rule looser than the server's produces
 * a 400 the operator has to decode, and a client rule STRICTER than the
 * server's silently refuses a save the API would have accepted, which is the
 * harder bug to notice because nothing ever errors.
 *
 * All four bounds were confirmed against the running API rather than read off
 * the DTO alone: `POST` with `{key:"Bad Key", label:"", emoji:"",
 * defaultExpiryMinutes:0}` answers 400 with one `errors[]` entry per field,
 * whose paths are exactly the four field names below. That is what makes the
 * server-error mapping in `category-form-dialog.tsx` land on fields rather than
 * in the form-level banner.
 *
 * `key` IS ON THIS SCHEMA BUT NOT ON EVERY SUBMIT. It is required to create a
 * category and impossible to change afterwards — `UpdateReportCategoryDto`
 * omits it, and the DTO explains why at length: three separate things address a
 * category by its key (the mobile app's `categoryKey`, `db:seed`'s ON CONFLICT
 * target, the citizen category list), none of which would notice it changing.
 * Renaming would orphan the old key for every client still sending it. So the
 * edit dialog renders the key as read-only text, and `formValuesToUpdatePayload`
 * cannot send it even by accident.
 *
 * EVERY TEXT FIELD IS A STRING, INCLUDING THE MINUTES. That is what an
 * `<input>` yields, and keeping the form's shape identical to the DOM's means
 * there is no half-parsed intermediate state to reason about — the conversion
 * to a number happens exactly once, in `formValuesToCreatePayload`, on the way
 * out. `citizenSelectable` is the one genuine boolean, because a checkbox
 * genuinely yields one.
 */

// From the DTO. Changing any of these without changing the DTO turns a form
// that looks fine into a 400 at submit time.
const KEY_MAX = 60;
const LABEL_MAX = 80;
const EMOJI_MAX = 16;
const EXPIRY_MIN = 1;
/** 43200 minutes = 30 days. A sanity bound against a typo'd 4320000, not a product rule. */
export const EXPIRY_MAX = 43200;

/**
 * The `key` regex, character for character from the DTO.
 *
 * lowerCamelCase: a lowercase letter followed by letters or digits. It exists
 * so a category is addressable the same way everywhere — `animalRescue`, not
 * `Animal Rescue` and not `animal-rescue`.
 */
const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export const categoryFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "A key is required — it is how the mobile app addresses this category.")
    .max(KEY_MAX, `Keep the key under ${KEY_MAX} characters.`)
    .regex(
      KEY_PATTERN,
      'Use lowerCamelCase: a lowercase letter, then letters or digits — e.g. "animalRescue".',
    ),
  label: z
    .string()
    .trim()
    .min(1, "A label is required — this is the name a citizen reads.")
    .max(LABEL_MAX, `Keep the label under ${LABEL_MAX} characters.`),
  emoji: z
    .string()
    .trim()
    .min(1, "An emoji is required — the mobile app shows it on the category chip.")
    // Generous on purpose, and matching the DTO: a flag or a ZWJ sequence is
    // several UTF-16 code units long, and both sides count the same units.
    .max(EMOJI_MAX, `That is longer than ${EMOJI_MAX} characters — one emoji, not a sentence.`),
  defaultExpiryMinutes: z
    .string()
    .trim()
    .min(1, "How long a request stays live is required.")
    .regex(/^\d+$/, "Whole minutes only — digits, with no decimal point or units.")
    .refine(
      (value) => Number(value) >= EXPIRY_MIN,
      `At least ${EXPIRY_MIN} minute — a category that expires instantly helps nobody.`,
    )
    .refine(
      (value) => Number(value) <= EXPIRY_MAX,
      `At most ${EXPIRY_MAX} minutes (30 days).`,
    ),
  citizenSelectable: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

/** Every field a server `validationErrors` entry is allowed to land on. */
export const CATEGORY_FIELD_NAMES = [
  "key",
  "label",
  "emoji",
  "defaultExpiryMinutes",
  "citizenSelectable",
] as const satisfies readonly (keyof CategoryFormValues)[];

export function isCategoryFieldName(path: string): path is keyof CategoryFormValues {
  return (CATEGORY_FIELD_NAMES as readonly string[]).includes(path);
}

/**
 * API record -> form values.
 *
 * `null` is coalesced away even though this contract has no nullable field:
 * a `null` handed to a React input flips it from controlled to uncontrolled,
 * the warning is easy to miss, and the symptom is that the operator's typing is
 * silently dropped. Writing the guard costs nothing and survives the API
 * relaxing a column to nullable later.
 *
 * The defaults on the create path are the ones a new category most often wants:
 * citizen-selectable (matching the column default, and eight of the nine seeded
 * rows), and 360 minutes — the same 6 hours `medicalHelp` and `roadsideHelp`
 * use, which is the middle of the seeded range rather than an invented number.
 */
export function categoryToFormValues(record: ReportCategoryRow | null): CategoryFormValues {
  return {
    key: record?.key ?? "",
    label: record?.label ?? "",
    emoji: record?.emoji ?? "",
    defaultExpiryMinutes: String(record?.defaultExpiryMinutes ?? 360),
    citizenSelectable: record?.citizenSelectable ?? true,
  };
}

export function formValuesToCreatePayload(
  values: CategoryFormValues,
): CreateReportCategoryPayload {
  return {
    key: values.key.trim(),
    label: values.label.trim(),
    emoji: values.emoji.trim(),
    defaultExpiryMinutes: Number(values.defaultExpiryMinutes),
    citizenSelectable: values.citizenSelectable,
  };
}

/**
 * Form values -> PATCH body. `key` is dropped, not merely left unchanged.
 *
 * VERIFIED AGAINST THE RUNNING API: a PATCH carrying `key` does NOT 400. Zod
 * strips unknown properties, so `UpdateReportCategorySchema.omit({ key: true })`
 * silently discards it and answers 200 with the ORIGINAL key — a request that
 * looks like a rename, reports success, and renames nothing.
 *
 * That is the worse failure of the two, and it is why the key is dropped here
 * rather than merely left out of the form: the field cannot leak into a request
 * even if someone later makes that read-only input editable by mistake, so the
 * console can never send a rename the API will quietly ignore.
 */
export function formValuesToUpdatePayload(
  values: CategoryFormValues,
): UpdateReportCategoryPayload {
  return {
    label: values.label.trim(),
    emoji: values.emoji.trim(),
    defaultExpiryMinutes: Number(values.defaultExpiryMinutes),
    citizenSelectable: values.citizenSelectable,
  };
}
