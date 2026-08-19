import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AddPhotoSchema = z.object({
  url: z.string().trim().url(),
});

export class AddPhotoDto extends createZodDto(AddPhotoSchema) {}
