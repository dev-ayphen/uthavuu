import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * "Today" is not a fact about the server — it is a fact about where the person
 * reading the dashboard is standing. Uthavu is a Tamil Nadu product and the
 * console shows an IST clock (docs/webadmin/03-dashboard-and-users.md §1), so
 * Asia/Kolkata is the default; the parameter exists so the boundary is stated
 * rather than assumed, and so the value is auditable in the response.
 */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const AdminDashboardSchema = z.object({
  // Validated here rather than passed straight through: the zone reaches
  // Postgres as a parameter to `AT TIME ZONE`, and an unknown zone name is a
  // runtime database error (a 500) instead of the 400 it actually is.
  timeZone: z
    .string()
    .trim()
    .min(1)
    .default('Asia/Kolkata')
    .refine(isKnownTimeZone, 'Unknown IANA time zone'),
});

export class AdminDashboardDto extends createZodDto(AdminDashboardSchema) {}
