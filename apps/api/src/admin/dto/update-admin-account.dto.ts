import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ADMIN_ROLE_KEYS } from '../admin-rbac';

/**
 * Edit an admin's name, email or role.
 *
 * Every field optional, but `.refine()` rejects the empty body. A PATCH that
 * changes nothing would still write an audit row saying somebody edited this
 * account, which is a lie in the one table that must not contain any.
 *
 * NO PASSWORD FIELD, deliberately. Rotating a password is
 * `POST /admin/admins/:id/reset-password` (another admin, no current password)
 * or `POST /admin/me/change-password` (yourself, current password required).
 * Folding it in here would put a credential change behind the same audit action
 * as a name typo, and would make the "did this request touch a password"
 * question un-answerable from the route alone.
 */
export const UpdateAdminAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(255).optional(),
    roleKey: z.enum(ADMIN_ROLE_KEYS).optional(),
  })
  .refine(
    (dto) =>
      dto.name !== undefined ||
      dto.email !== undefined ||
      dto.roleKey !== undefined,
    { message: 'Provide at least one of name, email or roleKey.' },
  );

export class UpdateAdminAccountDto extends createZodDto(
  UpdateAdminAccountSchema,
) {}

/**
 * `PATCH /admin/me` — an admin editing their OWN name and email.
 *
 * A separate schema from the one above, and the difference is the whole design:
 * **there is no `roleKey` field here**. Self-promotion is not blocked by a
 * check somebody could later delete, it is not expressible — the route has
 * nowhere to put a role. `assertNotSelf` keeps guarding `PATCH
 * /admin/admins/:id` so the privileged route stays aimed at other people, and
 * this one covers what the owner's permission table grants both roles ("Edit
 * own profile ✅ / ✅").
 *
 * STRICT, unlike every other DTO in this module. Zod strips unknown keys by
 * default, so `{ name, roleKey: 'super_admin' }` would otherwise return 200
 * having changed the name and silently ignored the promotion — a request that
 * looks like it worked, reports success, and did something else. On a route
 * whose entire job is to be the one an admin may aim at themselves, that
 * ambiguity is worth a 400.
 */
export const UpdateMyAdminProfileSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(255).optional(),
  })
  .refine((dto) => dto.name !== undefined || dto.email !== undefined, {
    message: 'Provide at least one of name or email.',
  });

export class UpdateMyAdminProfileDto extends createZodDto(
  UpdateMyAdminProfileSchema,
) {}
