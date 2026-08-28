import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Suspending someone requires saying why, in writing.
 *
 * Not a formality: the reason is the only thing that makes the decision
 * reviewable later, and it is what a second admin reads before deciding whether
 * to reactivate. An optional field would be empty on most rows within a week.
 *
 * It is stored on `user_account_status.reason` AND on the audit entry. The first
 * is the current state ("why is this account suspended right now"), the second
 * is the history ("why was it suspended that time in March") — a reactivate
 * clears the first and never touches the second.
 *
 * NEVER shown to the suspended user. They are told they are suspended; they are
 * not shown an internal moderation note about themselves.
 */
export const SuspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export class SuspendUserDto extends createZodDto(SuspendUserSchema) {}

/** Reactivation's reason is optional — undoing a block needs less ceremony than applying one. */
export const ReactivateUserSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export class ReactivateUserDto extends createZodDto(ReactivateUserSchema) {}
