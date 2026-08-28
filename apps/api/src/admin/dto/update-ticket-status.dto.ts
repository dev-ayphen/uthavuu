import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `statusKey` is checked against the `ticket_statuses` rows in the service
 * rather than pinned to an enum here — the whole point of a lookup table is
 * that adding "waiting_on_user" is a `db:seed` change, not a redeploy.
 *
 * `reason` is the admin's own note about why the status moved. It lands in the
 * audit row, never on the ticket, and is never shown to the citizen who filed
 * it.
 */
export const UpdateTicketStatusSchema = z.object({
  statusKey: z.string().trim().min(1, 'statusKey is required'),
  reason: z.string().trim().min(1).max(500).optional(),
});

export class UpdateTicketStatusDto extends createZodDto(
  UpdateTicketStatusSchema,
) {}
