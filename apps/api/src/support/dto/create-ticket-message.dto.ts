import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * A citizen's reply into their own ticket.
 *
 * `body` and nothing else. There is deliberately no `status` field and no
 * `isInternalNote` field: status is computed by the backend from what happened
 * (support/ticket-status.ts), and an internal note is a staff-only concept that
 * a citizen route must not be able to name — accepting the flag here and
 * ignoring it would be one refactor away from honouring it.
 *
 * 2000 chars matches the ticket description's cap, which is the same kind of
 * text arriving through the same composer.
 */
export const CreateTicketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message is required').max(2000),
});

export class CreateTicketMessageDto extends createZodDto(
  CreateTicketMessageSchema,
) {}
