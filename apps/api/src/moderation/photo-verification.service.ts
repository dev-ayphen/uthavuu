// Capture → quarantine → verify → verdict, in one place.
//
// THE ORDER IS THE SECURITY MODEL, so it is worth reading as a sequence:
//
//   1. rate limit   — before anything is written or any paid call is made, so a
//                     refused request costs nothing (same rule as the OTP limiter)
//   2. inspect      — magic bytes, decode, dimensions; the client's Content-Type
//                     is never consulted
//   3. fingerprint  — sha256 + perceptual hash
//   4. quarantine   — bytes land somewhere no static middleware serves
//   5. duplicates   — compared against prior uploads
//   6. analyse      — the provider sees the image; it decides nothing
//   7. decide       — thresholds turn signals into a verdict
//   8. persist      — the verdict is written before the caller hears it
//
// The photo is NEVER in the public directory during any of this. Promotion is a
// separate, later act performed only for a verdict that allows it.
//
// WHAT THE CLIENT IS TOLD, AND WHAT IT IS NOT. The response carries a verdict, an
// upload id and a reason code. It never carries confidence scores, provider
// names, model versions or label names — those are for moderators and the audit
// trail. A citizen who learns that "Explicit at 79 passes" has learned how to
// tune a photograph until it does.

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { reportCategories } from '../db/schema/reports-schema';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../db/schema/photo-verification-schema';
import { inspectImage } from '../uploads/image-inspection';
import { perceptualHash, hammingDistance } from '../uploads/perceptual-hash';
import { writeQuarantined } from '../uploads/quarantine-storage';
import { FORMAT_MIME } from '../uploads/report-photo-limits';
import {
  IMAGE_MODERATION_PROVIDER,
  type ImageModerationProvider,
} from './image-moderation-provider.interface';
import { moderationThresholds } from './moderation-thresholds';
import {
  decideVerification,
  type Verdict,
  type DecisionReason,
} from './verification-decision';
import type { ImageRejection } from '../uploads/image-inspection';

/** What the citizen client receives. Deliberately thin. */
export type VerificationResult = {
  uploadId: string | null;
  verdict: Verdict;
  /** Machine code the client maps to its own localised copy. */
  reason: DecisionReason | ImageRejection | null;
};

/** Verification status keys, mirroring the seeded lookup table. */
const STATUS_FOR_VERDICT: Record<Verdict, string> = {
  pass: 'passed',
  review: 'review_required',
  reject: 'rejected',
};

@Injectable()
export class PhotoVerificationService {
  constructor(
    @Inject(IMAGE_MODERATION_PROVIDER)
    private readonly provider: ImageModerationProvider,
  ) {}

  /**
   * Verifies one captured photo and records the outcome.
   *
   * Rate limiting happens in the controller, not here: it is an HTTP concern
   * with an HTTP status, and this method is also the one a retry path would
   * call.
   */
  async verify(input: {
    uploaderId: string;
    bytes: Buffer;
    categoryKey: string;
  }): Promise<VerificationResult> {
    // ── 2. Is it an image at all ────────────────────────────────────────────
    const inspection = inspectImage(input.bytes);
    if (!inspection.ok) {
      // Nothing is written and nothing is stored. A file that is not an image
      // has no verification record to keep, and creating one would put a row in
      // the moderator queue for a payload no moderator can look at.
      return { uploadId: null, verdict: 'reject', reason: inspection.reason };
    }

    // ── 3. Fingerprints ─────────────────────────────────────────────────────
    // The bitmap comes back from inspectImage so a 4 MB JPEG is decoded once.
    const phash = perceptualHash(inspection.bitmap);

    // ── 5. Duplicates (before the paid call — a known duplicate still needs
    //       analysing, but the lookup is free and the signal feeds the verdict)
    const duplicates = await this.findDuplicates(inspection.sha256, phash);

    // ── 4. Quarantine ───────────────────────────────────────────────────────
    const storedFilename = await writeQuarantined(
      input.bytes,
      inspection.format,
    );

    // ── 6. Analyse ──────────────────────────────────────────────────────────
    const category = await this.categoryFor(input.categoryKey);
    const outcome = await this.provider.analyzeImage({
      bytes: input.bytes,
      format: inspection.format,
    });

    // ── 7. Decide ───────────────────────────────────────────────────────────
    const decision = decideVerification({
      outcome,
      duplicateDistance: duplicates.nearestDistance,
      exactDuplicate: duplicates.exact,
      expectedLabels: category?.expectedLabels ?? null,
    });

    // ── 8. Persist ──────────────────────────────────────────────────────────
    // A provider failure is recorded as `failed` rather than `review_required`.
    // Both hold the photo for a human; only one tells an operator staring at a
    // full queue that Rekognition is down rather than that the model is strict.
    const statusKey =
      decision.unavailableReason !== null
        ? 'failed'
        : STATUS_FOR_VERDICT[decision.verdict];

    const uploadId = uuidv7();
    await db.insert(photoUploads).values({
      id: uploadId,
      uploaderId: input.uploaderId,
      statusId: await this.statusIdFor(statusKey),
      categoryId: category?.id ?? null,
      storedFilename,
      mimeType: FORMAT_MIME[inspection.format],
      byteSize: inspection.byteSize,
      width: inspection.width,
      height: inspection.height,
      sha256: inspection.sha256,
      phash,
      decision: decision.verdict,
      riskLevel: decision.riskLevel,
      reasons: decision.reasons,
      signals: decision.signals,
      provider: this.provider.name,
      moderationModelVersion:
        outcome.status === 'analysed'
          ? outcome.analysis.moderationModelVersion
          : null,
      labelModelVersion:
        outcome.status === 'analysed'
          ? outcome.analysis.labelModelVersion
          : null,
      unavailableReason: decision.unavailableReason,
      verifiedAt: new Date(),
    });

    // Ids, never image content or provider detail (§47).
    console.log(
      `[moderation] upload=${uploadId} verdict=${decision.verdict} ` +
        `risk=${decision.riskLevel} provider=${this.provider.name} ` +
        `reasons=${decision.reasons.join(',') || 'none'}`,
    );

    return {
      uploadId,
      verdict: decision.verdict,
      // The first reason is the one the client turns into a sentence. The full
      // list is stored for the moderator.
      reason: decision.reasons[0] ?? null,
    };
  }

  /**
   * Exact and near-duplicate lookup.
   *
   * Rejected uploads are excluded: a photo already refused is not evidence that
   * a new one is a reused image, and counting it would send the reporter's
   * second, legitimate attempt to a moderator because their first attempt
   * failed.
   */
  private async findDuplicates(
    sha256: string,
    phash: string,
  ): Promise<{ exact: boolean; nearestDistance: number | null }> {
    const rejectedStatusId = await this.statusIdFor('rejected');

    const [exactMatch] = await db
      .select({ id: photoUploads.id })
      .from(photoUploads)
      .where(
        and(
          eq(photoUploads.sha256, sha256),
          ne(photoUploads.statusId, rejectedStatusId),
        ),
      )
      .limit(1);

    // Perceptual hashes cannot be compared in SQL without a bit-distance
    // function, so the candidate set is pulled and compared here. Bounded to
    // the most recent 500: an unbounded scan would grow with the table forever,
    // and a reused stock photo is overwhelmingly likely to be recent. This is a
    // deliberate coverage limit, not an oversight — see the docs.
    const candidates = await db
      .select({ phash: photoUploads.phash })
      .from(photoUploads)
      .where(ne(photoUploads.statusId, rejectedStatusId))
      .orderBy(sql`${photoUploads.createdAt} desc`)
      .limit(500);

    let nearestDistance: number | null = null;
    for (const candidate of candidates) {
      const distance = hammingDistance(phash, candidate.phash);
      if (distance === null) continue;
      if (nearestDistance === null || distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    return { exact: exactMatch !== undefined, nearestDistance };
  }

  private async categoryFor(key: string) {
    const [category] = await db
      .select({
        id: reportCategories.id,
        expectedLabels: reportCategories.expectedLabels,
      })
      .from(reportCategories)
      .where(eq(reportCategories.key, key));
    return category;
  }

  private async statusIdFor(key: string): Promise<string> {
    const [row] = await db
      .select({ id: photoVerificationStatuses.id })
      .from(photoVerificationStatuses)
      .where(eq(photoVerificationStatuses.key, key));
    if (!row) {
      // Same loud failure AdminAuditService uses for a missing catalogue row: a
      // lookup key that is not seeded is a deployment fault, and silently
      // continuing would write a verdict nothing can interpret.
      throw new Error(
        `photo_verification_statuses is missing key "${key}" — did db:seed run?`,
      );
    }
    return row.id;
  }
}

/** Thresholds are re-read per call; exported for the admin surface to display. */
export { moderationThresholds };
