import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// discover-nearby-requests.md US-1/BR-2 — radius is one of a fixed set, not
// an arbitrary client-supplied number.
export const ReportsSummarySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce
    .number()
    .refine(
      (v) => [1, 3, 5, 10].includes(v),
      'radiusKm must be 1, 3, 5, or 10',
    ),
});

export class ReportsSummaryDto extends createZodDto(ReportsSummarySchema) {}
