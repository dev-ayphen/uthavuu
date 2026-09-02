import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `POST /admin/support-tickets/:id/messages` — a staff reply, or an internal
 * note, distinguished by one boolean.
 *
 * `isInternalNote` DEFAULTS TO FALSE, DELIBERATELY, EVEN THOUGH FALSE IS THE
 * RISKIER DEFAULT. A note that accidentally goes out as a reply is
 * embarrassing; a reply that accidentally becomes a note leaves a citizen
 * waiting for an answer that was already written and that nobody can see was
 * written. The console sends the flag explicitly on every request precisely so
 * this default is never the thing deciding, and the composer marks the two modes
 * differently on screen. The default exists for the API's own coherence, not as
 * a UI affordance.
 *
 * The citizen-side DTO (support/dto/create-ticket-message.dto.ts) has no such
 * field at all — an internal note is not something a citizen route can express.
 */
export const CreateTicketReplySchema = z.object({
  body: z.string().trim().min(1, 'Message is required').max(2000),
  isInternalNote: z.boolean().default(false),
});

export class CreateTicketReplyDto extends createZodDto(
  CreateTicketReplySchema,
) {}
