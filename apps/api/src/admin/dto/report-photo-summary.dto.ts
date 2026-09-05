import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * "Today" is not a fact about the server — it is a fact about where the
 * moderator is standing. Same reasoning, same default and the same validation as
 * `AdminDashboardSchema`: Uthavu is a Tamil Nadu product and the console shows
 * an IST clock, so Asia/Kolkata is the default, and the value comes back in the
 * response so the boundary is stated rather than assumed.
 *
 * Validated rather than passed through: the zone reaches Postgres as a parameter
 * to `AT TIME ZONE`, where an unknown name is a runtime database error (a 500)
 * instead of the 400 it actually is.
 */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const ReportPhotoSummarySchema = z.object({
  timeZone: z
    .string()
    .trim()
    .min(1)
    .default('Asia/Kolkata')
    .refine(isKnownTimeZone, 'Unknown IANA time zone'),
});

export class ReportPhotoSummaryDto extends createZodDto(
  ReportPhotoSummarySchema,
) {}
