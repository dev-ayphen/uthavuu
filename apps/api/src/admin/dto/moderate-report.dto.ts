import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Every report moderation action requires a written reason.
 *
 * Closing or hiding someone's request for emergency help is a consequential
 * act, and the audit entry is only as useful as the sentence attached to it.
 * Reinstating requires one too — "why did we put this back" is exactly the
 * question an appeal produces.
 */
export const ModerateReportSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export class ModerateReportDto extends createZodDto(ModerateReportSchema) {}
