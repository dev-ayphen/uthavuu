import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The Dashboard's activity feed is the one admin list that is NOT offset
 * paginated (admin-pagination.ts). Offset paging is wrong here for a reason
 * specific to this endpoint: the feed is merged from six tables ordered by time
 * descending, and new rows arrive at the TOP while the reader is paging down.
 * `?page=2` would re-show rows that page 1 already showed and skip rows it did
 * not, every time somebody posts a comment mid-scroll. A keyset cursor anchored
 * to the last row of the previous page cannot slip like that.
 *
 * There is also no `total`, deliberately: counting the whole union on every
 * request to render "Page 1 of 812" would double the query's cost to produce a
 * number an infinite-scroll feed never shows.
 */
export const ListActivitySchema = z.object({
  // Capped for the same reason every other admin list is capped: an admin
  // session may read everything, so an uncapped limit is a one-request denial
  // of service. 20 is the console's default page.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Opaque. Its contents are this API's business — the client only ever echoes
  // back what `nextCursor` gave it.
  cursor: z.string().trim().min(1).optional(),
});

export class ListActivityDto extends createZodDto(ListActivitySchema) {}
