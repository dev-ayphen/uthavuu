import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

export const AnalyticsSchema = z
  .object({
    /**
     * Same reasoning as AdminDashboardDto: "this week" is a fact about where the
     * reader is standing, and an unvalidated zone reaches Postgres as a
     * parameter to AT TIME ZONE, where an unknown name is a 500 rather than the
     * 400 it actually is.
     */
    timeZone: z
      .string()
      .trim()
      .min(1)
      .default('Asia/Kolkata')
      .refine(isKnownTimeZone, 'Unknown IANA time zone'),

    /**
     * Defaults to the last 30 days, resolved in the service against the
     * requested zone rather than here — a default computed at schema-parse time
     * would silently be UTC's idea of "30 days ago".
     */
    from: DateBound.optional(),
    to: DateBound.optional(),

    bucket: z.enum(['day', 'week', 'month']).default('day'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });

export class AnalyticsDto extends createZodDto(AnalyticsSchema) {}
