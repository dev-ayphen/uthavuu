import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The same 3–500 characters `ModerateReportSchema` requires, and deliberately
 * the same shape rather than an import: report moderation and photo moderation
 * are separate contracts that happen to agree today, and coupling them would
 * mean a change to one silently retunes the other.
 */
const Reason = z.string().trim().min(3).max(500);

/**
 * Refusing a photo requires a written reason. Approving one does not.
 *
 * NOT AN INCONSISTENCY — the asymmetry is the point. A refusal is a decision
 * made ABOUT a citizen that they cannot contest and, on `reject`, one that ends
 * their request; "why" is the only thing that makes it reviewable afterwards.
 * An approval is the system doing what the reporter already asked for, and
 * demanding a sentence for every routine clearance is how a queue of hundreds
 * turns into a column of "ok", "ok", "ok" — which is worse than an empty
 * column, because it looks like a record.
 *
 * The reason NEVER reaches the reporter. It goes to `photo_uploads.review_reason`
 * and the audit row; the alert the citizen receives is templated, bilingual and
 * says nothing about the model's reasoning (alert-templates.ts).
 */
export const ApproveReportPhotoSchema = z.object({
  reason: Reason.optional(),

  /**
   * The report the console believed this photo belonged to when the moderator
   * clicked Approve. Optional, and the console should always send it.
   *
   * It is an optimistic-concurrency guard, not a lookup key — the upload's own
   * `report_id` is authoritative and the transaction pins it either way. What
   * this catches is a STALE VIEW: a queue page rendered before the photo moved,
   * approved after. Approving publishes bytes to the public internet on the
   * strength of what a human saw on screen, so "what I was looking at is still
   * what is there" is worth being able to assert.
   */
  reportId: z.string().uuid().optional(),
});

export class ApproveReportPhotoDto extends createZodDto(
  ApproveReportPhotoSchema,
) {}

/** Reject and request-new: the reason is required. See above. */
export const RefuseReportPhotoSchema = z.object({
  reason: Reason,
});

export class RefuseReportPhotoDto extends createZodDto(
  RefuseReportPhotoSchema,
) {}
