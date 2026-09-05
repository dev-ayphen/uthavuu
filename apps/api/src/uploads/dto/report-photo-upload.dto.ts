import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Multipart body fields arrive as strings — there is no JSON parsing step on a
// file upload — so this schema is deliberately string-only and does no coercion.
//
// `categoryKey` is the report category the photo is being checked against, and
// it is a genuine INPUT to the verdict: category relevance is judged against the
// expected labels stored on that category row. It is validated against the
// database downstream rather than against a hardcoded enum here, for the same
// reason CreateReportSchema does it that way — categories are operator-editable
// data, and a list in a Zod schema would go stale the first time someone adds
// one through the console.
export const ReportPhotoUploadSchema = z.object({
  categoryKey: z.string().trim().min(1, 'A category is required'),
});

export class ReportPhotoUploadDto extends createZodDto(
  ReportPhotoUploadSchema,
) {}
