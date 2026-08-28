import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

export const ListAdminUsersSchema = PaginationSchema.extend({
  /** Free text over name, phone number and email. */
  q: z.string().trim().min(1).max(120).optional(),

  /**
   * Staff are excluded by default.
   *
   * The Users section is the citizen directory — the same population
   * AdminDashboardService counts as "Total Platform Users", which excludes
   * `admin_users` rows so that seeding two console logins does not inflate the
   * community's size forever. Defaulting the list to match the counter means
   * the number on the Dashboard and the number of rows in this table agree,
   * which is the first thing anyone checks. `staff` and `all` are there for
   * when someone genuinely wants to see console accounts.
   */
  audience: z.enum(['citizen', 'staff', 'all']).default('citizen'),

  /** Account status — see db/schema/user-status-schema.ts. */
  status: z.enum(['active', 'suspended', 'all']).default('all'),

  district: z.string().trim().min(1).max(120).optional(),

  /**
   * `profileCompletedAt` is null until Profile Setup finishes, so this splits
   * "signed up" from "actually onboarded" — a real support question.
   */
  profileCompleted: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),

  from: DateBound.optional(),
  to: DateBound.optional(),

  sort: z.enum(['createdAt', 'name', 'reports']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListAdminUsersDto extends createZodDto(ListAdminUsersSchema) {}
