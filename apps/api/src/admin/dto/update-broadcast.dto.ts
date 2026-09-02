import { createZodDto } from 'nestjs-zod';
import {
  AUDIENCE_MISMATCH_MESSAGE,
  BroadcastFieldsSchema,
  audienceMatchesDistrict,
} from './create-broadcast.dto';

/**
 * Every editable field, all optional.
 *
 * `status` is deliberately absent, and this is stronger than the equivalent rule
 * on Announcements. There, publish/archive are separate endpoints because each
 * is a distinct audited act. Here, `sent` is IRREVERSIBLE and reaches every
 * citizen selected: a PATCHable `status` would make sending a fifty-thousand-
 * person notification a field assignment, indistinguishable in the audit trail
 * from fixing a typo. Sending is POST /admin/broadcasts/:id/send, and nothing
 * else can produce it.
 *
 * PATCH is refused outright on anything past `draft`/`scheduled`
 * (BROADCAST_IMMUTABLE) — editing the wording of a notice already delivered to
 * people's phones would rewrite history that recipients can still see on their
 * own devices.
 *
 * The refinement below runs on the payload alone and therefore cannot catch a
 * PATCH that changes only one half of the audience/district pair; see
 * create-broadcast.dto.ts and AdminBroadcastsService.update(), which re-runs it
 * against the merged row.
 */
export const UpdateBroadcastSchema = BroadcastFieldsSchema.partial().refine(
  audienceMatchesDistrict,
  { message: AUDIENCE_MISMATCH_MESSAGE, path: ['district'] },
);

export class UpdateBroadcastDto extends createZodDto(UpdateBroadcastSchema) {}
