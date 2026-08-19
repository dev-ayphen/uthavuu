import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// docs/features/report-a-request.md US-1/US-2/US-3/US-4. `categoryKey` matches
// a report_categories.key (see db/seed.ts) — validated against the DB, not a
// hardcoded enum here. `expiryMinutes` may only shorten the category default
// (BR-2), enforced in ReportsService, not here (needs the category row).
export const CreateReportSchema = z.object({
  categoryKey: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  landmark: z.string().trim().max(200).optional(),
  anonymous: z.boolean().optional().default(false),
  phoneVisible: z.boolean().optional().default(false),
  expiryMinutes: z.number().int().positive().optional(),
  // BR-1: at least one, max 4 — URLs already come from POST /uploads.
  photoUrls: z
    .array(z.string().trim().url())
    .min(1, 'At least one photo is required')
    .max(4, 'Up to 4 photos allowed'),
});

export class CreateReportDto extends createZodDto(CreateReportSchema) {}
