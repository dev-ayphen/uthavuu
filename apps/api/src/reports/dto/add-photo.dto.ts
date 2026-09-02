import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// The third way a URL reaches report_photos.url. `.url()` is syntax only —
// ReportsService.addPhoto() runs assertPhotosAreOurUploads() to confirm this is
// a file POST /uploads actually served.
export const AddPhotoSchema = z.object({
  url: z.string().trim().url(),
});

export class AddPhotoDto extends createZodDto(AddPhotoSchema) {}
