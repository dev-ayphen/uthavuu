import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The body `POST /admin/support-tickets/:id/resolve` and `.../close` accept.
 *
 * EVERYTHING IS OPTIONAL, INCLUDING THE BODY ITSELF — an empty `{}` parses, so
 * the console's `POST` with no body works today and can start sending a reason
 * tomorrow without an API change.
 *
 * ON ADR 0012's "reason required on destructive actions": neither of these is
 * destructive. Nothing is deleted, nothing becomes unreadable, and both are
 * reversible from the console's own Status control (which is exactly why
 * `TICKET_WORKING_STATUS_KEYS` keeps `open`/`in_progress` in the dropdown).
 * The audit row still records actor, role, timestamp, and the before/after
 * status — what is optional here is the stated motive, on an action that can be
 * undone. Contrast `admin.revoke` or a category delete, where it is not.
 *
 * `message` is the useful part: a resolution almost always comes with something
 * to tell the citizen, and making them write it as a separate reply first is how
 * tickets get resolved in silence. When present it is posted as a normal,
 * citizen-visible reply inside the same transaction as the resolve — one act,
 * one audit row, no half-done state where the status moved but the explanation
 * did not.
 */
export const CloseSupportTicketSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

export class CloseSupportTicketDto extends createZodDto(
  CloseSupportTicketSchema,
) {}
