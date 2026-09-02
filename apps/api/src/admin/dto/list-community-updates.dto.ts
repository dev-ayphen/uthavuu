import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

/**
 * Community -> Updates, list filters.
 *
 * `status` is a plain string validated against `community_update_statuses` in
 * the service, not a hardcoded `z.enum` here — it is a lookup table
 * (CLAUDE.md § Database), and the point of a lookup table is that adding a row
 * does not require recompiling a DTO. The same choice, for the same reason, as
 * ListSupportTicketsSchema's `status`.
 *
 * `z.coerce.*` on page/limit comes from PaginationSchema: every value in a query
 * string arrives as text.
 */
export const ListCommunityUpdatesSchema = PaginationSchema.extend({
  status: z.string().trim().min(1).optional(),
  // Free-text search across all four copy columns — see the service. Capped at
  // 200 because a search term longer than that is a paste accident, not a query.
  q: z.string().trim().min(1).max(200).optional(),
});

export class ListCommunityUpdatesDto extends createZodDto(
  ListCommunityUpdatesSchema,
) {}
