import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The reason an admin gives for removing or restoring a comment.
 *
 * REQUIRED, not optional. This is the field that makes the audit trail worth
 * having: "Super Admin removed a comment" answers nothing on review, and an
 * optional reason is one nobody fills in. Requiring it costs a moderator five
 * seconds and is the difference between a log and an explanation.
 */
export const ModerateCommentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export class ModerateCommentDto extends createZodDto(ModerateCommentSchema) {}
