// Turns verified upload ids into publishable report photos.
//
// THE SINGLE GATE. Three code paths write `report_photos` — create(), the
// full-replace update(), and addPhoto() — and before this existed all three took
// a URL string from the client. `assertStoredUploads` made that safe in one
// sense (the URL really was one this API served) and left it wide open in
// another: nothing had ever looked at the picture.
//
// So the currency changes from "a URL the client says we served" to "an id of a
// verification record we wrote ourselves". A caller cannot manufacture one, and
// cannot alter the verdict attached to it — the verdict is re-read from the
// database on every attach, never taken from the request. That is what makes
// §3's "the mobile app must never be trusted to make the final decision"
// structurally true rather than merely intended.

import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import { photoUploads } from '../db/schema/photo-verification-schema';
import { promoteToPublic } from '../uploads/quarantine-storage';
import { buildUploadUrl } from '../uploads/upload-url';

export type ResolvedUpload = {
  id: string;
  storedFilename: string;
  decision: string | null;
  /** The category this photo was actually JUDGED against — see resolveUploads. */
  categoryId: string | null;
  /** Set once a moderator has adjudicated this upload. See resolveUploads. */
  reviewedAt: Date | null;
};

export type AttachmentPlan = {
  uploads: ResolvedUpload[];
  /** True when at least one photo needs a moderator before anything publishes. */
  holdForReview: boolean;
};

/**
 * Loads the uploads a caller is trying to attach, refusing anything it may not.
 *
 * Ownership is in the WHERE clause, not a post-fetch check: an upload belonging
 * to somebody else is never fetched, so there is no moment where the wrong row
 * exists in memory beside a permission test.
 *
 * `reportId is null` matters as much as ownership. Without it, a caller could
 * pass the id of an upload already attached to one of their own published
 * reports and mint a second report from the same verified photo — reusing one
 * verdict indefinitely.
 */
export async function resolveUploads(
  uploadIds: string[],
  uploaderId: string,
  /**
   * The category the report is actually being filed under.
   *
   * CLOSES A REAL BYPASS. Category relevance is judged at CAPTURE time, against
   * whichever category was selected then — and `communityHelp` deliberately has
   * no expected labels, so relevance is skipped and anything passes. Without
   * this check a client could upload a photo under Community Help, collect a
   * `pass`, and then file the report under Animal Rescue, skipping the relevance
   * rule entirely. The verdict would be genuine and would be answering a
   * different question than the one the report asks.
   *
   * ⚠️ OPTIONAL IN THE SIGNATURE, MANDATORY IN PRACTICE. It was once left out of
   * the post-publish paths (`update()`, `addPhoto()`) on the reasoning that
   * requiring an explicit `pass` there made it redundant. It does not: a pass
   * collected under Community Help was never judged for relevance at all, so
   * `assertAllPassed` waved it straight onto a live Animal Rescue report and
   * published the bytes. All four call sites now pass the category the report is
   * actually filed under; a new one that does not is reopening that bypass.
   */
  expectedCategoryId?: string,
): Promise<AttachmentPlan> {
  if (uploadIds.length === 0) {
    throw new BadRequestException({
      code: 'PHOTO_REQUIRED',
      message: 'At least one verified photo is required.',
    });
  }

  // De-duplicated: the same id twice would otherwise produce two report_photos
  // rows pointing at one file, and the second promote() would find it gone.
  const unique = [...new Set(uploadIds)];

  const rows = await db
    .select({
      id: photoUploads.id,
      storedFilename: photoUploads.storedFilename,
      decision: photoUploads.decision,
      categoryId: photoUploads.categoryId,
      reviewedAt: photoUploads.reviewedAt,
    })
    .from(photoUploads)
    .where(
      and(
        inArray(photoUploads.id, unique),
        eq(photoUploads.uploaderId, uploaderId),
        isNull(photoUploads.reportId),
      ),
    );

  if (rows.length !== unique.length) {
    // One message for "does not exist", "is not yours" and "already used". The
    // distinction is only useful to somebody probing for other people's ids.
    throw new BadRequestException({
      code: 'PHOTO_NOT_VERIFIED',
      message:
        'One or more photos could not be attached. Please capture them again.',
    });
  }

  // An upload a moderator has already decided about cannot be recycled into a
  // new report — in either direction.
  //
  // This is not hypothetical. When a reporter replaces a photo an admin asked
  // them to retake, the superseded upload is DETACHED (its `report_id` is
  // cleared) so it stops blocking that report's release. That leaves a row which
  // is unattached and therefore resolvable, and whose MACHINE `decision` may
  // still read `review` even though a human refused it — `decision` is never
  // overwritten, by design. Without this guard a reporter could re-submit the
  // very image a moderator turned down and have it merely held again rather than
  // refused, laundering a human decision into a machine one.
  const adjudicated = rows.find((row) => row.reviewedAt !== null);
  if (adjudicated) {
    throw new BadRequestException({
      code: 'PHOTO_NOT_VERIFIED',
      message:
        'One or more photos could not be attached. Please capture them again.',
    });
  }

  const rejected = rows.find((row) => row.decision === 'reject');
  if (rejected) {
    throw new BadRequestException({
      code: 'PHOTO_REJECTED',
      message:
        "This photo cannot be used because it does not meet Uthavu's image guidelines.",
    });
  }

  // Anything that is not an explicit pass holds the report. `null` lands here
  // too — an upload with no recorded verdict is one whose verification never
  // completed, and treating an absent decision as a pass is the exact silent
  // bypass this whole feature exists to prevent.
  //
  // A category switch between capture and filing holds it as well. The verdict
  // stays on the row exactly as it was recorded — it was a truthful answer to
  // the question asked at the time — but it is no longer an answer to THIS
  // report's question, so a human decides rather than a stale heuristic.
  const categoryChanged =
    expectedCategoryId !== undefined &&
    rows.some(
      (row) => row.categoryId !== null && row.categoryId !== expectedCategoryId,
    );

  const holdForReview =
    categoryChanged || rows.some((row) => row.decision !== 'pass');

  return { uploads: rows, holdForReview };
}

/**
 * Refuses anything not already passed.
 *
 * Used by the post-publish paths (edit, add-photo). A live report cannot be
 * un-published by adding a questionable photo to it — volunteers may already be
 * travelling to it — and holding the new photo while leaving the report visible
 * would mean a "pending" image nobody can see and nobody is told about. So the
 * reporter is asked to take another one, and the limitation is documented rather
 * than hidden.
 */
export function assertAllPassed(plan: AttachmentPlan): void {
  if (plan.holdForReview) {
    throw new BadRequestException({
      code: 'PHOTO_NEEDS_REVIEW',
      message:
        'This photo needs to be checked before it can be added. Please capture a different one.',
    });
  }
}

/**
 * Moves passed photos into public storage and returns their URLs.
 *
 * Called only once the report row exists and the verdict allows publication, so
 * a file becomes publicly readable strictly after the database says it may be.
 * The reverse order would leave a window where the bytes are reachable and
 * nothing records that they should be.
 */
export async function publishUploads(
  plan: AttachmentPlan,
  // The Express request, threaded through so the URL is built by the SAME
  // function that builds every other upload URL. A second builder here would
  // drift from resolveBaseUrl's trusted-origin rules the first time either
  // changed, and the failure would be a photo URL pointing somewhere this
  // deployment never declared.
  req: Request,
): Promise<{ uploadId: string; url: string }[]> {
  const published: { uploadId: string; url: string }[] = [];

  for (const upload of plan.uploads) {
    const filename = await promoteToPublic(upload.storedFilename);
    if (!filename) {
      // The row says the photo exists and the disk disagrees. Refusing is the
      // only honest response: publishing a report whose photo is missing gives
      // volunteers a broken card for a real emergency.
      throw new BadRequestException({
        code: 'PHOTO_UNAVAILABLE',
        message: 'A photo could not be attached. Please capture it again.',
      });
    }
    published.push({ uploadId: upload.id, url: buildUploadUrl(req, filename) });
  }

  return published;
}

/**
 * Detaches every upload currently linked to a report.
 *
 * Used when a reporter replaces photos an admin asked them to retake. The
 * superseded rows KEEP their verdict, their reviewer and their reason — that is
 * the accountability trail and the audit log points at these ids — they simply
 * stop belonging to the report.
 *
 * WHY DETACHING IS NECESSARY, not tidiness: `requestNew` leaves the old upload
 * with status `rejected`, and `PhotoModerationService.standingFor()` counts a
 * `rejected` upload as `refused`, which blocks `publishIfReady()` permanently.
 * Leave it attached and the reporter can satisfy the moderator's request, pass
 * verification, and still never publish — a dead end with no error anywhere.
 *
 * Detached rows become orphans, which the quarantine retention sweep already
 * collects after its window.
 */
export async function detachUploadsFrom(reportId: string): Promise<void> {
  await db
    .update(photoUploads)
    .set({ reportId: null, updatedAt: new Date() })
    .where(eq(photoUploads.reportId, reportId));
}

/** Links uploads to the report they were attached to, so the queue can find them. */
export async function linkUploadsToReport(
  plan: AttachmentPlan,
  reportId: string,
): Promise<void> {
  await db
    .update(photoUploads)
    .set({ reportId, updatedAt: new Date() })
    .where(
      inArray(
        photoUploads.id,
        plan.uploads.map((upload) => upload.id),
      ),
    );
}
