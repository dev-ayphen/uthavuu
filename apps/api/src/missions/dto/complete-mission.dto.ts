import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CompleteMissionSchema = z.object({
  photoUrl: z.string().trim().url(),
  note: z.string().trim().min(1, 'A completion note is required').max(1000),
});

export class CompleteMissionDto extends createZodDto(CompleteMissionSchema) {}
