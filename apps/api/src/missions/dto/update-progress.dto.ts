import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateProgressSchema = z.object({
  status: z.enum(['on_the_way', 'reached_location', 'helping_now']),
});

export class UpdateProgressDto extends createZodDto(UpdateProgressSchema) {}
