import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// BR-6: category and location are immutable after publish — only description
// and landmark can change here. Adding photos is its own endpoint
// (POST /reports/:id/photos) since photos can only be added, never removed.
export const UpdateReportSchema = z.object({
  description: z.string().trim().min(1).max(2000).optional(),
  landmark: z.string().trim().max(200).optional(),
});

export class UpdateReportDto extends createZodDto(UpdateReportSchema) {}
