import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Settings → Privacy. Both optional so a client can update just one toggle
// without echoing the other back.
export const UpdatePrivacySchema = z.object({
  defaultAnonymous: z.boolean().optional(),
  defaultPhoneVisible: z.boolean().optional(),
});

export class UpdatePrivacyDto extends createZodDto(UpdatePrivacySchema) {}
