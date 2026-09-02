import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

/**
 * A date bound from a query string.
 *
 * Same shape as list-audit-logs.dto.ts / list-admin-reports.dto.ts and for the
 * same reason: `z.coerce.date()` accepts anything `new Date()` accepts, which
 * includes garbage that silently becomes Invalid Date and then reaches Postgres
 * as `NaN` — a 500 for what is really a 400. The refinement turns that into an
 * honest validation error.
 */
const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

/**
 * The filter for Community -> Impact Stories.
 *
 * Deliberately smaller than ListAdminReportsSchema. There is no `status` filter
 * beyond what the completion's own lookup row carries, no `includeDeleted`, and
 * no sort/order pair:
 *
 *  - **No `includeDeleted`.** An Impact Story is a *published* record of help
 *    that happened. A soft-deleted report has been removed from the product, so
 *    its story is removed too — invariant 1 in docs/architecture/data.md
 *    ("any new listing must add `isNull(reports.deletedAt)` ... unless the admin
 *    view deliberately shows deleted rows"). This view deliberately does not.
 *    Reviewing a removal decision is the *reports* screen's job, and
 *    `GET /admin/reports/:id` already reaches deleted rows and names who
 *    removed them.
 *  - **No approval/moderation filter.** Whether Impact Stories need approval is
 *    open question 12 (docs/_audit/open-questions.md) and is NOT decided. A
 *    completion is created already `verified` in the same statement that
 *    inserts it (missions.service.ts), so `status` here reflects the completion
 *    lifecycle that exists, not a review queue that does not. Inventing a
 *    `pending`/`approved` filter would be inventing the product.
 *  - **No sort parameter.** One order — newest story first — because that is
 *    the only ordering the frozen console contract asks for. Adding a knob the
 *    UI does not send is API surface nobody tests.
 */
export const ListImpactStoriesSchema = PaginationSchema.extend({
  /**
   * Bounds on the completion's `submitted_at` — when the story happened — NOT
   * on `reports.created_at`. The report's creation date is the *start* of the
   * duration this endpoint reports; the story's own date is when help landed.
   * Filtering on the other one would make "stories from last week" quietly mean
   * "stories about requests raised last week", which is a different question.
   */
  from: DateBound.optional(),
  to: DateBound.optional(),

  categoryKey: z.string().trim().min(1).max(64).optional(),

  /** Free text over the report title only (the story's headline). */
  q: z.string().trim().min(1).max(200).optional(),
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListImpactStoriesDto extends createZodDto(
  ListImpactStoriesSchema,
) {}
