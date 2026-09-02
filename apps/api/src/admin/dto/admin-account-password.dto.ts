import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AdminPasswordSchema } from './create-admin-account.dto';

/**
 * `POST /admin/admins/:id/reset-password` — the SUPER-ADMIN path.
 *
 * It takes no `currentPassword`, and that absence is a decision rather than an
 * omission. A Super Admin resetting somebody else's password does not know it
 * and must not be asked to: a "current password" field on this route could only
 * ever be satisfied by asking the locked-out person for the secret they have
 * lost, which is the exact situation the route exists to resolve. Requiring it
 * would be security theatre — the real control is `platform:manage`, the
 * self-check in the service, and the audit row.
 *
 * The reset itself is what gets recorded. The password never appears in the
 * response, the log, or `before`/`after`.
 */
export const ResetAdminPasswordSchema = z.object({
  newPassword: AdminPasswordSchema,
});

export class ResetAdminPasswordDto extends createZodDto(
  ResetAdminPasswordSchema,
) {}

/**
 * `POST /admin/me/change-password` — the SELF path, and the only route on this
 * surface any admin may call against their own account.
 *
 * `currentPassword` is required here for the reason it is absent above: the
 * caller knows it, so proving possession costs them nothing and closes the gap
 * where a walked-away-from session silently becomes permanent account
 * takeover. It is verified with Better Auth's own verifier before anything is
 * written (see AdminCredentials).
 *
 * The `.refine()` rejects setting the password to the one already in use — a
 * no-op rotation that would nonetheless write an audit row claiming the
 * credential changed.
 */
export const ChangeMyPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: AdminPasswordSchema,
  })
  .refine((dto) => dto.currentPassword !== dto.newPassword, {
    message: 'The new password must differ from the current one.',
    path: ['newPassword'],
  });

export class ChangeMyPasswordDto extends createZodDto(ChangeMyPasswordSchema) {}
