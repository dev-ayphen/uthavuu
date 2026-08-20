import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(1000),
});

export class CreateCommentDto extends createZodDto(CreateCommentSchema) {}
