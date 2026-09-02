import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  SPONSOR_CREATIVE_TYPE_KEYS,
  SPONSOR_PLACEMENT_KEYS,
} from '../../db/schema/sponsors-schema';

/**
 * A campaign-window timestamp from a JSON body.
 *
 * `z.coerce.date()` accepts anything `new Date()` accepts, which includes
 * garbage that silently becomes Invalid Date and then reaches Postgres as
 * `NaN` — a 500 for what is really a 400. The refinement turns that into an
 * honest validation error. Same guard, same reason, as
 * create-community-update.dto.ts's `ScheduleAt`.
 *
 * `.nullable()` sits OUTSIDE the coercion deliberately: ZodNullable
 * short-circuits on `null` before the coercion runs, so an explicit `null`
 * stays `null` instead of becoming `new Date(null)` — 1970-01-01, a start date
 * that would put a campaign live at the dawn of Unix time. `null` means "clear
 * this bound"; omitting the key means "leave it alone".
 */
const CampaignDate = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date')
  .nullable();

/**
 * An optional URL field.
 *
 * `.url()` matches complete-profile.dto.ts's `avatarUrl`, and it is safe with
 * ADR 0008's local-disk uploads because `buildUploadUrl()` returns an ABSOLUTE
 * url (`http://192.168.1.5:3001/uploads/a.jpg`), never a bare path — so the one
 * storage mechanism this product has passes validation as-is. `null` clears the
 * field; the empty string is rejected rather than stored, so "no logo" has
 * exactly one spelling and a card never tries to render `src=""`.
 */
const NullableUrl = z.string().trim().url().max(2048).nullable();

/** Optional free text. `.min(1)` so '' cannot masquerade as "not set". */
const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable();

/**
 * The editable shape of a sponsor, shared by create and update.
 *
 * ONLY `name` AND `creativeType` ARE REQUIRED. That mirrors the schema (name is
 * the one NOT NULL copy column) and the console's six-step wizard
 * (docs/webadmin/08-monetization.md §3.4), which exists precisely because the
 * information arrives in pieces — a sponsor is often entered from a phone call
 * with nothing but an organisation name.
 *
 * `creativeType` is required because there is no "no creative type" state:
 * `logo_text` IS the zero-asset creative, so a missing value would be that
 * value spelled as a null. See the column comment in db/schema/sponsors-schema.ts.
 *
 * `status` is deliberately ABSENT, and the console's own `SponsorPayload`
 * agrees. A sponsor moves between states through `/pause` and `/activate`
 * because each is a separately audited act — "who put this advertisement in
 * front of every user in the country" is exactly the question ADR 0012's trail
 * exists to answer, and a status buried in a general-purpose PATCH would
 * collapse it into an indistinguishable `sponsor.update` row.
 */
export const SponsorFieldsSchema = z.object({
  name: z.string().trim().min(1, 'A sponsor name is required').max(200),
  logoUrl: NullableUrl.optional(),
  description: nullableText(2000).optional(),
  website: NullableUrl.optional(),
  category: nullableText(80).optional(),
  campaignName: nullableText(200).optional(),
  location: nullableText(200).optional(),
  // A bare key, not `{ key, label }`: the API owns the lookup table and
  // resolves the label. `z.enum` rather than a free string checked in the
  // service — unlike `status`, a creative type the app has no renderer for is a
  // client bug worth a 400.
  creativeType: z.enum(SPONSOR_CREATIVE_TYPE_KEYS),
  creativeUrl: NullableUrl.optional(),
  // The set of surfaces this sponsor appears on, replacing whatever is stored.
  //
  // De-duplicated here rather than relying on the unique constraint to reject
  // the request: ["home", "home"] is a client that serialised a checkbox list
  // twice, and the user's INTENT is unambiguous — show it on the home feed.
  // Answering 409 to an unambiguous intent is a worse API than normalising it.
  // The constraint still exists as the backstop.
  placements: z
    .array(z.enum(SPONSOR_PLACEMENT_KEYS))
    .max(SPONSOR_PLACEMENT_KEYS.length)
    .transform((keys) => [...new Set(keys)])
    .optional(),
  startDate: CampaignDate.optional(),
  endDate: CampaignDate.optional(),
});

/**
 * The one cross-field rule, in the DTO rather than the service per CLAUDE.md
 * § Conventions.
 *
 * NOTE THE LIMIT OF THIS CHECK, because it is not the whole enforcement story.
 * It can only compare the two values present in THIS payload. A PATCH that
 * sends `endDate` alone must still be checked against the `startDate` already
 * stored on the row, which no DTO can see — AdminSponsorsService.update()
 * re-runs the same comparison on the merged result and throws
 * END_BEFORE_START. The database has no CHECK constraint; these two are the
 * only guards.
 */
export const endAfterStart = (value: {
  startDate?: Date | null;
  endDate?: Date | null;
}) =>
  !value.startDate ||
  !value.endDate ||
  value.endDate.getTime() > value.startDate.getTime();

export const END_AFTER_START_MESSAGE = '`endDate` must be after `startDate`';

export const CreateSponsorSchema = SponsorFieldsSchema.refine(endAfterStart, {
  message: END_AFTER_START_MESSAGE,
  path: ['endDate'],
});

export class CreateSponsorDto extends createZodDto(CreateSponsorSchema) {}
