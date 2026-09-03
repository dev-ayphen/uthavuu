import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// docs/features/report-a-request.md US-1/US-2/US-3/US-4. `categoryKey` matches
// a report_categories.key (see db/seed.ts) — validated against the DB, not a
// hardcoded enum here. `expiryMinutes` may only shorten the category default
// (BR-2), enforced in ReportsService, not here (needs the category row).
export const CreateReportSchema = z.object({
  categoryKey: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required').max(120),
  // edit-cancel-report.md: a real minimum, not just non-empty — long enough
  // to reject "help"/"asap" while not being onerous for a genuine request.
  description: z
    .string()
    .trim()
    .min(
      20,
      'Description must be at least 20 characters — give volunteers enough to act on',
    )
    .max(2000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  landmark: z.string().trim().max(200).optional(),
  anonymous: z.boolean().optional().default(false),
  phoneVisible: z.boolean().optional().default(false),
  expiryMinutes: z.number().int().positive().optional(),
  // accept-and-mission-chat.md BR-1: 1–20, default 1 (solo mission), fixed after publish in v1.
  neededVolunteers: z.number().int().min(1).max(20).optional().default(1),
  // BR-1: at least one, max 4. `.url()` is a SYNTAX check only — it accepts
  // `http://evil.com/x.png`. That each URL is really one POST /uploads served
  // is enforced in ReportsService.assertPhotosAreOurUploads(), which needs the
  // filesystem and the declared origins; do not read this line as that check.
  photoUrls: z
    .array(z.string().trim().url())
    .min(1, 'At least one photo is required')
    .max(4, 'Up to 4 photos allowed'),
});

export class CreateReportDto extends createZodDto(CreateReportSchema) {}
