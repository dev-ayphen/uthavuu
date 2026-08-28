import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Where a flag may be moved to.
 *
 * 'submitted' is deliberately absent. It is the state a flag is CREATED in
 * (CommentsService.flag()), and it means "no admin has looked at this yet" —
 * a fact about history, not a state anyone can return a flag to. Allowing it
 * would let a moderator quietly erase the evidence that a flag had been
 * reviewed, which is the opposite of what this queue is for.
 */
export const RESOLVABLE_FLAG_STATUS_KEYS = [
  'under_review',
  'action_taken',
  'dismissed',
] as const;

export const ResolveFlagSchema = z.object({
  statusKey: z.enum(RESOLVABLE_FLAG_STATUS_KEYS),
  // Optional here, unlike ModerateCommentDto's: moving a flag to 'under_review'
  // is a triage step with nothing to justify yet, and forcing prose for it would
  // train moderators to type "." to get past the field.
  reason: z.string().trim().min(3).max(500).optional(),
});

export class ResolveFlagDto extends createZodDto(ResolveFlagSchema) {}
