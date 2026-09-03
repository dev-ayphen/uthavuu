import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `PATCH /admin/support-tickets/:id` — the console's edit surface for a ticket's
 * staff-owned fields. Every field optional; at least one required.
 *
 * WHY `assignedAdminId` IS `.nullable()` AND THE REST ARE NOT.
 * `null` is the unassign instruction, and it has to be distinguishable from
 * "this PATCH is not about assignment" — which is what an absent key means.
 * A schema that only allowed a string would leave no way to hand a ticket back
 * to the queue, and the obvious workaround (an empty string) is a user id that
 * does not exist. Every other field has no meaningful null: a ticket always has
 * a status, a priority and a category.
 *
 * `status` and `priority` are lookup KEYS resolved against the database in the
 * service, not enums pinned here — adding a state stays a `db:seed` change. The
 * service rejects an unknown one with a 400 rather than writing it, so the
 * lookup table is still the authority.
 *
 * There is deliberately no `subject`, `description` or `relatedReportId` here.
 * Those are the citizen's words and the citizen's link; staff moving a ticket
 * through a workflow have no business editing what somebody reported.
 */
export const UpdateSupportTicketSchema = z
  .object({
    status: z.string().trim().min(1).optional(),
    priority: z.string().trim().min(1).optional(),
    assignedAdminId: z.string().trim().min(1).nullable().optional(),
    categoryId: z.string().uuid().optional(),
    /**
     * The admin's own note about why. Lands in the audit row, never on the
     * ticket, and is never shown to the citizen who filed it.
     */
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (dto) =>
      dto.status !== undefined ||
      dto.priority !== undefined ||
      dto.assignedAdminId !== undefined ||
      dto.categoryId !== undefined,
    {
      // Without this, an empty PATCH would write an audit row asserting a change
      // that did not happen — the same reason updateStatus() refuses a no-op.
      message: 'Nothing to update.',
      path: ['status'],
    },
  );

export class UpdateSupportTicketDto extends createZodDto(
  UpdateSupportTicketSchema,
) {}

/**
 * The service takes this rather than the DTO class, so `updateStatus()` can
 * delegate to `update()` with a plain object instead of fabricating a DTO
 * instance. Two code paths that move a ticket's status is exactly how the two of
 * them end up disagreeing about `resolvedAt`.
 */
export type UpdateSupportTicketInput = z.infer<
  typeof UpdateSupportTicketSchema
>;
