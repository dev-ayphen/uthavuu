import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const FLAG_REASONS = [
  'spam',
  'abuse',
  'false_information',
  'duplicate',
  'other',
] as const;

export const FlagCommentSchema = z.object({
  reason: z.enum(FLAG_REASONS),
});

export class FlagCommentDto extends createZodDto(FlagCommentSchema) {}
