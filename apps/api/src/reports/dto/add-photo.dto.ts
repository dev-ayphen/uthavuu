import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// The third way a photo reaches report_photos. Takes a verified upload id, not
// a URL — see report-photo-attachment.ts for why the currency changed.
//
// Post-publish, so only an upload that already PASSED may be attached: adding a
// held photo to a live report would either un-publish a request volunteers are
// already travelling to, or leave a pending image nobody can see.
export const AddPhotoSchema = z.object({
  uploadId: z.string().trim().uuid(),
});

export class AddPhotoDto extends createZodDto(AddPhotoSchema) {}
