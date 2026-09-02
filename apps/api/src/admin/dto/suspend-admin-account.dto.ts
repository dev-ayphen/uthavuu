import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Suspending an ADMIN account.
 *
 * The mechanism is ADR 0011's, unchanged and not duplicated: a row in
 * `user_account_status`, enforced by the `session.create.before` login hook and
 * the global `SuspendedAccountGuard`. An admin is a `user`, so both enforcement
 * points already cover them — there is no parallel admin-status table and there
 * must never be one, or "suspended" would come to mean two things.
 *
 * What differs from `POST /admin/users/:id/suspend` is only who may do it and
 * to whom: that route explicitly REFUSES staff (`CANNOT_SUSPEND_ADMIN`,
 * admin-users.service.ts) and says "revoke their admin role instead". This is
 * the route it was pointing at, gated on `platform:manage` and fenced by the
 * last-super-admin rule.
 *
 * `reason` is OPTIONAL here where it is required on the citizen route. A
 * citizen suspension is a moderation decision that a second admin may later
 * review and reverse, so it has to carry its justification. Suspending a
 * colleague is usually an operational act — they left, their laptop is missing —
 * and gating that behind a free-text field would encourage "x" to be typed into
 * it. When it is given it is recorded in both places, exactly as the citizen
 * one is.
 */
export const SuspendAdminAccountSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export class SuspendAdminAccountDto extends createZodDto(
  SuspendAdminAccountSchema,
) {}

/** Lifting a suspension. Undoing a block needs less ceremony than applying one. */
export const ReactivateAdminAccountSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export class ReactivateAdminAccountDto extends createZodDto(
  ReactivateAdminAccountSchema,
) {}
