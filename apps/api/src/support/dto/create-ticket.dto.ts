import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * BOTH `categoryId` AND `categoryKey` ARE ACCEPTED, and that is not indecision.
 *
 * The original endpoint took `categoryKey` (validated against ticket_categories,
 * not a hardcoded enum here — same pattern as reports' categoryKey). The mobile
 * client written against the conversation contract sends `categoryId`, which it
 * reads from `GET /support/categories`. Both name exactly one row of the same
 * lookup table, so refusing either would break a shipped client to make a point
 * about spelling. Exactly one is required; if both arrive, `categoryId` wins
 * because an id cannot be ambiguous.
 *
 * `relatedReportId` links the ticket to the request it is about. It is a
 * REFERENCE AND NOTHING MORE: it does not grant its author any access to that
 * report's Mission Chat, which stays gated on `hasAccepted` in MissionsService
 * (ADR 0010). The service checks the report is real and citizen-visible before
 * storing it, so a ticket cannot be used to confirm the existence of a report
 * that was removed.
 */
export const CreateTicketSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    categoryKey: z.string().trim().min(1).optional(),
    subject: z.string().trim().min(1, 'Subject is required').max(150),
    description: z.string().trim().min(1, 'Description is required').max(2000),
    relatedReportId: z.string().uuid().optional(),
  })
  .refine((dto) => Boolean(dto.categoryId ?? dto.categoryKey), {
    message: 'categoryId or categoryKey is required',
    path: ['categoryId'],
  });

export class CreateTicketDto extends createZodDto(CreateTicketSchema) {}
