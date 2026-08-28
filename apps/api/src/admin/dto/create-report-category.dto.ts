import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `key` is the identifier every other surface addresses a category by — the
 * mobile app's own category list, `db/seed.ts`'s upsert target, and
 * `CreateReportSchema.categoryKey`. It is lowerCamelCase across the board
 * (`animalRescue`, `bloodDonation`, `lostAndFound`), so the pattern enforces
 * that shape rather than accepting `Animal Rescue` or `animal-rescue` and
 * leaving a category nothing can address consistently.
 *
 * It is also why there is no `key` field on the update DTO — see that file.
 */
export const CreateReportCategorySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(
      /^[a-z][a-zA-Z0-9]*$/,
      'key must be lowerCamelCase — a lowercase letter followed by letters or digits, e.g. "animalRescue"',
    ),
  label: z.string().trim().min(1, 'Label is required').max(80),
  // One or two code points in practice; the cap is generous because a flag or a
  // ZWJ sequence is several code units long, and this column is display-only.
  emoji: z.string().trim().min(1, 'Emoji is required').max(16),
  // 43200 minutes = 30 days. The longest seeded default is 72h (communityHelp),
  // so this is deliberately loose — it is a sanity bound against a typo'd
  // 4320000, not a product rule. BR-2's real rule (a reporter may shorten but
  // never extend a category's default) is enforced in ReportsService.create().
  defaultExpiryMinutes: z.number().int().min(1).max(43200),
  // Defaults true, matching the column default. Disaster Relief is the one
  // seeded row that sets this false (BR-3: it exists for admins, citizens
  // cannot post to it).
  citizenSelectable: z.boolean().default(true),
});

export class CreateReportCategoryDto extends createZodDto(
  CreateReportCategorySchema,
) {}
