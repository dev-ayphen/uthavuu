import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

/**
 * Monetization -> Sponsors, list filters.
 *
 * `status` is a plain string, not a `z.enum` — and here that differs from
 * `placements` in create-sponsor.dto.ts on purpose. A status is a lookup-table
 * row (CLAUDE.md § Database), and the point of a lookup table is that adding
 * one does not require recompiling a DTO; a placement is a closed contract with
 * a mobile component's props. Same file, two enum-shaped fields, opposite
 * treatment, because they answer to different authorities.
 *
 * ⚠️ THIS FILTERS ON THE **DERIVED** STATUS, not `sponsors.status_id`. Two of
 * the five values a caller can send here — `scheduled` and `expired` — are
 * never stored on any row, so a filter keyed on the column would return an
 * empty list forever while claiming to have checked. See
 * sponsors/sponsor-status.ts. An unrecognised value yields an empty page rather
 * than a 400, matching AdminSupportService.list(): the console's options come
 * from the lookup table, so a value it can actually select always exists.
 *
 * `z.coerce.*` on page/limit comes from PaginationSchema: every value in a
 * query string arrives as text.
 */
export const ListAdminSponsorsSchema = PaginationSchema.extend({
  status: z.string().trim().min(1).optional(),
  // Free-text search across the four columns an operator would remember a
  // sponsor by. Capped at 200 because a longer term is a paste accident, not a
  // query.
  q: z.string().trim().min(1).max(200).optional(),
});

export class ListAdminSponsorsDto extends createZodDto(
  ListAdminSponsorsSchema,
) {}
