import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Dashboard header stats — same radius-parameter shape as ReportsSummarySchema
// (a fixed set, not an arbitrary client-supplied number).
export const CommunityStatsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().refine((v) => [1, 3, 5, 10].includes(v), 'radiusKm must be 1, 3, 5, or 10'),
});

export class CommunityStatsDto extends createZodDto(CommunityStatsSchema) {}
