import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * A scheduling timestamp from a JSON body.
 *
 * `z.coerce.date()` accepts anything `new Date()` accepts, which includes
 * garbage that silently becomes Invalid Date and then reaches Postgres as
 * `NaN` — a 500 for what is really a 400. The refinement turns that into an
 * honest validation error. Same guard, same reason, as
 * list-support-tickets.dto.ts's `DateBound`.
 *
 * `.nullable()` sits OUTSIDE the coercion deliberately: ZodNullable
 * short-circuits on `null` before the coercion runs, so an explicit `null`
 * stays `null` instead of becoming `new Date(null)` — which is 1970-01-01, a
 * timestamp that would quietly publish an update at the dawn of Unix time.
 * `null` means "clear this schedule"; omitting the key means "leave it alone".
 */
const ScheduleAt = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date')
  .nullable();

/**
 * The editable shape of a community update, shared by create and update.
 *
 * ENGLISH IS REQUIRED, TAMIL IS NOT — and that asymmetry is the product rule,
 * not an oversight (see the header of db/schema/updates-schema.ts). English is
 * what every citizen falls back to, so it cannot be optional; Tamil is written
 * when someone has actually written it, and an announcement must be publishable
 * before then. There is deliberately no rule that `titleTa` implies `bodyTa`:
 * the fallback is per-field, so a Tamil headline over an English body is a
 * legitimate half-translated state rather than an error to reject.
 */
export const CommunityUpdateFieldsSchema = z.object({
  titleEn: z.string().trim().min(1, 'An English title is required').max(200),
  bodyEn: z.string().trim().min(1, 'An English body is required').max(5000),
  // `.nullable()` so an editor can clear a translation they no longer want to
  // ship. Empty string is rejected by `.min(1)` rather than accepted and stored:
  // '' would render as a blank card in Tamil, silently, where NULL routes
  // through the English fallback. "No translation" has exactly one spelling.
  titleTa: z.string().trim().min(1).max(200).nullable().optional(),
  bodyTa: z.string().trim().min(1).max(5000).nullable().optional(),
  publishAt: ScheduleAt.optional(),
  expiresAt: ScheduleAt.optional(),
});

/**
 * The one cross-field rule, in the DTO rather than the service per CLAUDE.md
 * § Conventions.
 *
 * NOTE THE LIMIT OF THIS CHECK, because it is not the whole enforcement story.
 * It can only compare the two values present in THIS payload. A PATCH that
 * sends `expiresAt` alone must still be checked against the `publishAt` already
 * stored on the row, which no DTO can see — AdminCommunityUpdatesService.update()
 * re-runs the same comparison on the merged result and throws
 * EXPIRES_BEFORE_PUBLISH. The database has no CHECK constraint; these two are
 * the only guards.
 */
export const expiresAfterPublish = (value: {
  publishAt?: Date | null;
  expiresAt?: Date | null;
}) =>
  !value.publishAt ||
  !value.expiresAt ||
  value.expiresAt.getTime() > value.publishAt.getTime();

export const EXPIRES_AFTER_PUBLISH_MESSAGE =
  '`expiresAt` must be after `publishAt`';

export const CreateCommunityUpdateSchema = CommunityUpdateFieldsSchema.refine(
  expiresAfterPublish,
  {
    message: EXPIRES_AFTER_PUBLISH_MESSAGE,
    path: ['expiresAt'],
  },
);

export class CreateCommunityUpdateDto extends createZodDto(
  CreateCommunityUpdateSchema,
) {}
