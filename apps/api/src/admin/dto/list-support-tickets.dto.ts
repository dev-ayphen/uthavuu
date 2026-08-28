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

export const ListSupportTicketsSchema = PaginationSchema.extend({
  // Validated against ticket_statuses / ticket_categories in the service, not
  // as a hardcoded enum here — both are lookup tables (CLAUDE.md § Database),
  // so an admin adding a status must not need this file recompiled.
  status: z.string().trim().min(1).optional(),
  categoryKey: z.string().trim().min(1).optional(),
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
