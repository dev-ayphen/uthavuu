import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

// Shared with list-flagged-comments.dto.ts's own bounds. `z.coerce.date()`
// accepts anything `new Date()` does, which includes garbage that becomes
// Invalid Date and then reaches Postgres as NaN — a 500 for what is really a
// 400. The refinement is what makes it an honest validation error.
export const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

export const ListAdminCommentsSchema = PaginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  reportId: z.string().uuid().optional(),
  authorId: z.string().trim().min(1).optional(),
  from: DateBound.optional(),
  to: DateBound.optional(),
  // Removed comments are hidden by default: the console's Comments tab is a
  // view of the live conversation, and a moderator who wants to review what was
  // taken down asks for it explicitly.
  //
  // NOT `z.coerce.boolean()`. Query params arrive as strings and
  // `Boolean("false") === true`, so coercion would make `?includeRemoved=false`
  // mean the opposite of what it says — every "off" toggle the console sends
  // would silently turn the filter on. Parsing the two literal strings is the
  // only reading that matches what a caller typed.
  includeRemoved: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Tri-state on purpose. Absent means "no opinion"; true means "has at least
  // one flag"; false means "has none". A plain `.default(false)` would silently
  // turn the unfiltered view into "unflagged only".
  flagged: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListAdminCommentsDto extends createZodDto(ListAdminCommentsSchema) {}
