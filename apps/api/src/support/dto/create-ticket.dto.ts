import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// categoryKey matches a ticket_categories.key (see db/seed.ts) — validated
// against the DB, not a hardcoded enum here, same pattern as reports'
// categoryKey.
export const CreateTicketSchema = z.object({
  categoryKey: z.string().trim().min(1),
  subject: z.string().trim().min(1, 'Subject is required').max(150),
  description: z.string().trim().min(1, 'Description is required').max(2000),
});

export class CreateTicketDto extends createZodDto(CreateTicketSchema) {}
