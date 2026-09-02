import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ADMIN_ROLE_KEYS } from '../admin-rbac';

/**
 * A console password, validated to the SAME floor the auth layer enforces.
 *
 * 8 is not a taste decision — it is `emailAndPassword.minPasswordLength: 8` in
 * auth/auth.ts. If the two disagree, the looser one is a lie: a password this
 * DTO accepted but Better Auth would reject produces an account whose owner
 * cannot sign in, and there is no password-reset email in this product
 * (ADR 0003) to recover from it. 128 is Better Auth's own
 * `maxPasswordLength` default, checked against the installed 1.7.1 source.
 *
 * DELIBERATELY NOT `.trim()`. Every other string field in this file trims,
 * because a trailing space in a name is a typo. In a password it is a
 * character: silently removing it stores a different secret than the one the
 * operator typed and read back to the new admin over the phone.
 */
const Password = z.string().min(8).max(128);

/**
 * Provision a new admin account.
 *
 * This creates a `user` row, a `credential` account row and an `admin_users`
 * row together, which is the same three-part shape db/seed-admins.ts writes —
 * the seed provisions the FIRST admins, this endpoint provisions every one
 * after. Neither has a self-service path: there is no sign-up, `disableSignUp`
 * is set in auth.ts, and an admin exists only because another admin holding
 * `platform:manage` created them.
 *
 * `roleKey` is validated against the code catalogue here for a clean 400, and
 * resolved against `admin_roles` in the service — the database stays the
 * runtime authority (admin-rbac.ts), this is only the fast, honest rejection.
 */
export const CreateAdminAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // No `.toLowerCase()`: the value is stored as typed, because Better Auth
  // looks the account up by the string it was given. The service refuses a
  // case-variant duplicate instead, so "Admin@x.org" cannot become a second,
  // unusable account alongside "admin@x.org".
  email: z.string().trim().email().max(255),
  password: Password,
  roleKey: z.enum(ADMIN_ROLE_KEYS),
});

export class CreateAdminAccountDto extends createZodDto(
  CreateAdminAccountSchema,
) {}

export { Password as AdminPasswordSchema };
