import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';
import { EFFECTIVE_STATUSES } from '../../reports/report-effective-status';

const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

/**
 * The admin report filter — deliberately the inverse of the citizen one.
 *
 * `ListReportsDto` (reports/dto/list-reports.dto.ts) REQUIRES categoryKey, lat,
 * lng and radiusKm, and its query hard-filters to status='open'. That is right
 * for a phone showing nearby cards and useless for a console: an admin has no
 * location, wants every category, and most often wants exactly the reports a
 * citizen can no longer see. So every filter here is optional and the default is
 * "everything that is not hidden".
 */
export const ListAdminReportsSchema = PaginationSchema.extend({
  /**
   * DERIVED status, not `reports.status_id` — see report-effective-status.ts.
   * `status=expired` is the filter that would silently return nothing forever if
   * it trusted the stored column, because nothing in this codebase writes it.
   */
  status: z.enum([...EFFECTIVE_STATUSES, 'all']).default('all'),

  /**
   * Soft-deleted reports are hidden by default and reachable on request.
   *
   * Open question 5 (docs/_audit/open-questions.md) asks whether admins should
   * see them at all. Defaulting to hidden is the conservative half of that
   * question: nobody is shown removed content unless they ask, and the ability
   * to review a removal decision — which the audit trail makes necessary — is
   * still there. `status=deleted` implies this.
   */
  includeDeleted: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),

  categoryKey: z.string().trim().min(1).max(64).optional(),
  reporterId: z.string().trim().min(1).optional(),

  /** Free text over title, description and landmark. */
  q: z.string().trim().min(1).max(200).optional(),

  from: DateBound.optional(),
  to: DateBound.optional(),

  sort: z.enum(['createdAt', 'expiryAt', 'title']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListAdminReportsDto extends createZodDto(ListAdminReportsSchema) {}
