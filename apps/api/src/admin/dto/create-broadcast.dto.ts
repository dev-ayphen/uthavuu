import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BROADCAST_AUDIENCE_KEYS } from '../../db/schema/broadcasts-schema';

/**
 * A scheduling timestamp from a JSON body.
 *
 * Lifted from create-community-update.dto.ts's `ScheduleAt`, including both of
 * its non-obvious parts:
 *
 *  - `z.coerce.date()` accepts anything `new Date()` accepts, which includes
 *    garbage that silently becomes Invalid Date and then reaches Postgres as
 *    `NaN` — a 500 for what is really a 400. The refinement makes it an honest
 *    validation error.
 *  - `.nullable()` sits OUTSIDE the coercion deliberately: ZodNullable
 *    short-circuits on `null` before the coercion runs, so an explicit `null`
 *    stays `null` instead of becoming `new Date(null)` — 1970-01-01, which here
 *    would mean a broadcast scheduled for the dawn of Unix time.
 *
 * `null` means "clear the schedule" (back to `draft`); omitting the key means
 * "leave it alone".
 */
const ScheduleAt = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date')
  .nullable();

/**
 * The editable shape of a broadcast, shared by create and update.
 *
 * ENGLISH IS REQUIRED, TAMIL IS NOT — the same product rule as Announcements,
 * and for a sharper reason here. English is what every citizen falls back to, so
 * it cannot be optional; Tamil is written when someone has actually written it.
 * This is an emergency product: a flood warning must be sendable before its
 * translation exists. There is deliberately no rule that `titleTa` implies
 * `bodyTa` — the fallback is per-field, so a Tamil headline over an English body
 * is a legitimate half-translated state rather than an error to reject.
 *
 * `audience` is a `z.enum` here, unlike `status` on the list DTO which is a
 * plain string. The difference is not an inconsistency: a status FILTERS rows,
 * so an unknown value can safely yield an empty page, whereas an audience
 * SELECTS RECIPIENTS — an unrecognised one would have no query behind it and
 * would fan out to nobody while reporting success. See the note on
 * `broadcastAudiences` in db/schema/broadcasts-schema.ts.
 */
export const BroadcastFieldsSchema = z.object({
  titleEn: z.string().trim().min(1, 'An English title is required').max(200),
  bodyEn: z.string().trim().min(1, 'An English body is required').max(2000),
  // `.nullable()` so an editor can clear a translation they no longer want to
  // ship. Empty string is rejected by `.min(1)` rather than accepted and stored:
  // '' would render as a blank notification in Tamil, silently, where NULL
  // routes through the English fallback. "No translation" has one spelling.
  titleTa: z.string().trim().min(1).max(200).nullable().optional(),
  bodyTa: z.string().trim().min(1).max(2000).nullable().optional(),
  audience: z.enum(BROADCAST_AUDIENCE_KEYS),
  // Matched against `user.district`, which is free text from the mobile
  // client's reverse-geocode — there is no districts table to key against, so a
  // typo here selects nobody. That is why the send response reports
  // `recipientCount`: an audience of zero is visible rather than silent.
  district: z.string().trim().min(1).max(120).nullable().optional(),
  scheduledAt: ScheduleAt.optional(),
});

/**
 * The one cross-field rule: `district` is set if and only if the audience is
 * `district`.
 *
 * Both halves matter and they fail differently. A `district` audience with no
 * district would fan out to every user in the country — the exact opposite of
 * what was asked for, and unrecoverable once sent. An `all_users` audience
 * carrying a stale district string is harmless to the send but leaves a row that
 * reads as targeted when it was not, which is a lie the console would repeat
 * forever.
 *
 * NOTE THE LIMIT OF THIS CHECK, because it is not the whole enforcement story.
 * It can only compare the two values present in THIS payload. A PATCH that sends
 * `district: null` alone, or flips `audience` alone, must still be checked
 * against whatever is already stored on the row — which no DTO can see.
 * AdminBroadcastsService.update() re-runs the same rule on the MERGED result and
 * throws BROADCAST_AUDIENCE_MISMATCH. The database has no CHECK constraint;
 * these two are the only guards.
 */
export const audienceMatchesDistrict = (value: {
  audience?: 'all_users' | 'district';
  district?: string | null;
}) =>
  value.audience === undefined ||
  (value.audience === 'district'
    ? typeof value.district === 'string' && value.district.length > 0
    : value.district === undefined || value.district === null);

export const AUDIENCE_MISMATCH_MESSAGE =
  '`district` is required when audience is "district", and must be absent or null when audience is "all_users"';

export const CreateBroadcastSchema = BroadcastFieldsSchema.refine(
  audienceMatchesDistrict,
  { message: AUDIENCE_MISMATCH_MESSAGE, path: ['district'] },
);

export class CreateBroadcastDto extends createZodDto(CreateBroadcastSchema) {}
