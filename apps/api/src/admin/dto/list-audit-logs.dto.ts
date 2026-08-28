import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';
import {
  ADMIN_AUDIT_ACTION_KEYS,
  ADMIN_AUDIT_TARGET_TYPE_KEYS,
} from '../admin-audit-catalogue';

/**
 * A date bound from a query string.
 *
 * `z.coerce.date()` accepts anything `new Date()` accepts, which includes
 * garbage that silently becomes Invalid Date and then reaches Postgres as
 * `NaN` — a 500 for what is really a 400. The refinement is what turns that
 * into an honest validation error.
 */
const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

export const ListAuditLogsSchema = PaginationSchema.extend({
  actorUserId: z.string().trim().min(1).optional(),
  // Constrained to the seeded catalogue rather than a free string: a typo'd
  // action silently returns an empty page, which reads as "nothing happened"
  // rather than "you asked for something that does not exist".
  action: z.enum(ADMIN_AUDIT_ACTION_KEYS as unknown as [string, ...string[]]).optional(),
  targetType: z
    .enum(ADMIN_AUDIT_TARGET_TYPE_KEYS as unknown as [string, ...string[]])
    .optional(),
  targetId: z.string().trim().min(1).optional(),
  from: DateBound.optional(),
  to: DateBound.optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListAuditLogsDto extends createZodDto(ListAuditLogsSchema) {}
