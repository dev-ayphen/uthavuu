import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

/**
 * A date bound from a query string.
 *
 * `z.coerce.date()` accepts anything `new Date()` accepts, which includes
 * garbage that silently becomes Invalid Date and then reaches Postgres as
 * `NaN` — a 500 for what is really a 400. The refinement turns that into an
 * honest validation error.
 */
const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

export const LIST_SUPPORT_TICKETS_SORTS = ['createdAt', 'updatedAt'] as const;

/**
 * The sentinel the `assigned` filter uses for "nobody has picked this up".
 *
 * Every other value that filter carries is a real `user.id`, which needs no
 * convention. Only the empty case has no id to send. Exported so the console and
 * this DTO share one spelling rather than two that agree by luck — the console's
 * `ASSIGNED_UNASSIGNED` in `features/support-tickets/catalogue.ts` is the same
 * string, and it was written as an explicit guess pending this line.
 */
export const ASSIGNED_UNASSIGNED = 'unassigned';

export const ListSupportTicketsSchema = PaginationSchema.extend({
  // Validated against ticket_statuses / ticket_categories / ticket_priorities in
  // the service, not as a hardcoded enum here — all three are lookup tables
  // (CLAUDE.md § Database), so an operator adding a priority must not need this
  // file recompiled.
  status: z.string().trim().min(1).optional(),
  /**
   * A `ticket_categories.key`.
   *
   * TWO SPELLINGS, ONE FILTER. `categoryKey` is what the first version of this
   * endpoint shipped with; `category` is what the frozen console contract asks
   * for. Accepting both costs one `??` in the service and avoids a filter that
   * silently does nothing — Zod strips unknown keys, so the wrong spelling would
   * not 400, it would just quietly return the unnarrowed queue. That failure
   * mode (an operator believing they are looking at a filtered list) is the one
   * worth spending a line to prevent.
   */
  category: z.string().trim().min(1).optional(),
  categoryKey: z.string().trim().min(1).optional(),
  priority: z.string().trim().min(1).optional(),
  /** A `user.id`, or `unassigned` for the tickets nobody owns. */
  assigned: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  userId: z.string().trim().min(1).optional(),
  from: DateBound.optional(),
  to: DateBound.optional(),
  sort: z.enum(LIST_SUPPORT_TICKETS_SORTS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListSupportTicketsDto extends createZodDto(
  ListSupportTicketsSchema,
) {}
