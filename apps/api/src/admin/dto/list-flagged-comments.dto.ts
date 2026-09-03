import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';
import { DateBound } from './list-admin-comments.dto';

// The four seeded flag_statuses keys (db/seed.ts FLAG_STATUSES).
export const FLAG_STATUS_KEYS = [
  'submitted',
  'under_review',
  'action_taken',
  'dismissed',
] as const;

// What "pending review" means, and the same pair AdminDashboardService counts
// for its flaggedCommentsPendingReview tile — kept identical on purpose so the
// dashboard badge and this queue can never disagree about the number.
export const PENDING_FLAG_STATUS_KEYS = ['submitted', 'under_review'] as const;

export const ListFlaggedCommentsSchema = PaginationSchema.extend({
  status: z.enum(FLAG_STATUS_KEYS).optional(),
  reportId: z.string().uuid().optional(),
  from: DateBound.optional(),
  to: DateBound.optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListFlaggedCommentsDto extends createZodDto(
  ListFlaggedCommentsSchema,
) {}
