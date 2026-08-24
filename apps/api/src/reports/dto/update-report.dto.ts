import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// edit-cancel-report.md: category and lat/lng are immutable after publish —
// changing where or what a request is for mid-flight is exactly the
// "volunteer travelling to the wrong address" risk this feature exists to
// prevent, so those two never appear here regardless of edit-lock state.
// Every field below is otherwise the same validation as CreateReportSchema
// (apps/api/src/reports/dto/create-report.dto.ts) — kept in sync
// deliberately, not by shared import, since Zod's partial() would also
// loosen photoUrls' min(1) in a way that's easy to miss.
export const UpdateReportSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120).optional(),
  description: z
    .string()
    .trim()
    .min(20, 'Description must be at least 20 characters — give volunteers enough to act on')
    .max(2000)
    .optional(),
  landmark: z.string().trim().max(200).optional(),
  neededVolunteers: z.number().int().min(1).max(20).optional(),
  anonymous: z.boolean().optional(),
  phoneVisible: z.boolean().optional(),
  // Full replace when present — matches CreateReportSchema's own bounds.
  photoUrls: z
    .array(z.string().trim().url())
    .min(1, 'At least one photo is required')
    .max(4, 'Up to 4 photos allowed')
    .optional(),
});

export class UpdateReportDto extends createZodDto(UpdateReportSchema) {}
