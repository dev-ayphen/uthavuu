import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// The locale the server renders push notifications in — see
// alerts/alert-templates.ts. Deliberately separate from the free-text
// `language` profile field, which records what the user *told* us they speak
// ("Tamil", "English, some Hindi") and is display-only. This one is a machine
// value the renderer switches on, so it is constrained to the locales the
// catalog actually has.
export const UpdateLocaleSchema = z.object({
  locale: z.enum(['en', 'ta']),
});

export class UpdateLocaleDto extends createZodDto(UpdateLocaleSchema) {}
