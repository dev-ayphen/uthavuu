import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

/**
 * Community -> Broadcasts, list filters.
 *
 * `status` is a plain string validated against `broadcast_statuses` in the
 * service, not a hardcoded `z.enum` here — it is a lookup table (CLAUDE.md
 * § Database), and the point of a lookup table is that adding a row does not
 * require recompiling a DTO. An unknown key yields an empty page rather than a
 * 400, matching ListCommunityUpdatesSchema and ListSupportTicketsSchema.
 *
 * Contrast `audience` on the create/update DTOs, which IS a `z.enum` — see the
 * note there. Filtering by an unknown value is harmless; fanning out to one is
 * not.
 *
 * `z.coerce.*` on page/limit comes from PaginationSchema: every value in a query
 * string arrives as text.
 */
export const ListBroadcastsSchema = PaginationSchema.extend({
  status: z.string().trim().min(1).optional(),
  // Free-text search across all four copy columns — staff search for the wording
  // they remember, and remembering it in Tamil is the normal case for a Tamil
  // broadcast. Capped at 200 because a longer term is a paste accident, not a
  // query.
  q: z.string().trim().min(1).max(200).optional(),
});

export class ListBroadcastsDto extends createZodDto(ListBroadcastsSchema) {}

/**
 * The optional reason on DELETE.
 *
 * ADR 0012 requires a reason on destructive actions and records Announcements'
 * `DELETE` — which passes `reason: null` — as "a deviation, not a precedent",
 * caused by a frozen no-body contract that a half-built console was already
 * written against. This is the narrow way to honour the ADR without repeating
 * that mistake: an OPTIONAL query parameter, so a client calling
 * `DELETE /admin/broadcasts/:id` with nothing still works, and one that has a
 * reason can record it.
 *
 * It is worth noting why the weaker guarantee is defensible HERE specifically:
 * DELETE is refused on anything past `draft`, so the only rows it can ever touch
 * are broadcasts that were never sent to a single person. The destructive
 * admin action on this table is `send`, not `delete`, and that one is audited
 * unconditionally.
 */
export const DeleteBroadcastQuerySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export class DeleteBroadcastQueryDto extends createZodDto(
  DeleteBroadcastQuerySchema,
) {}
