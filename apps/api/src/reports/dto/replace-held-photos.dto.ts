import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// The reporter's reply to a moderator's "please send a different photo".
//
// Same shape and same bounds as CreateReportSchema's `photoUploadIds`, and
// deliberately not a partial or a delta: the edit form sends the complete set it
// wants. A delta would make "which photos does this report have now" depend on
// replaying every request that ever touched it.
export const ReplaceHeldPhotosSchema = z.object({
  photoUploadIds: z
    .array(z.string().trim().uuid())
    .min(1, 'At least one photo is required')
    .max(4, 'Up to 4 photos allowed'),
});

export class ReplaceHeldPhotosDto extends createZodDto(
  ReplaceHeldPhotosSchema,
) {}
