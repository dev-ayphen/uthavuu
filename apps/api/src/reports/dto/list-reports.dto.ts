import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// discover-nearby-requests.md US-3/BR-3 — category-first, nearest-first, no
// alternate sort in v0.1.
export const ListReportsSchema = z.object({
  categoryKey: z.string().trim().min(1),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce
    .number()
    .refine(
      (v) => [1, 3, 5, 10].includes(v),
      'radiusKm must be 1, 3, 5, or 10',
    ),
});

export class ListReportsDto extends createZodDto(ListReportsSchema) {}
