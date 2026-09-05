// The publication half of photo verification: when a held report becomes
// publishable, and what publishing it actually consists of.
//
// WHY THIS IS NOT IN `admin/`. Nothing here is an admin concept. It answers a
// question about a REPORT — "is every photo on this thing resolved, and if so,
// put it live" — and the answer has to be identical whoever asked. Today the
// only caller is AdminReportPhotosService, because a human moderator is the only
// thing that resolves a held photo. The moment anything else can (a re-run of a
// provider that was down, a retention sweep that expires an undecided photo),
// it must reach the same rule rather than a second copy of it. The admin service
// owns the DECISION; this owns the CONSEQUENCE.
//
// ─── WHY PUBLICATION HAPPENS AT RELEASE, NOT AT APPROVAL ────────────────────
//
// A moderator approving one photo of a three-photo report does NOT put that
// photo into `report_photos` or move its bytes into public storage. Everything
// publishes at once, at the moment the report itself goes `open`. Three reasons,
// in order of weight:
//
//  1. quarantine-storage.ts states the invariant this whole feature exists for:
//     bytes become publicly readable only AFTER the database says the report may
//     show them. A `report_photos` row on a `pending_review` report is invisible
//     to every citizen surface (report-visibility.ts `notPrePublication`), so
//     promoting early buys nothing and spends exactly the guarantee that was
//     expensive to get.
//
//  2. The machine-PASSED photos on a held report have no `report_photos` row
//     either. ReportsService.create() writes none when `holdForReview` is true —
//     not for the held photo and not for its passed siblings — so a release that
//     only published the approved one would drop the rest of the report's photos
//     on the floor and leave their bytes in quarantine forever. Publishing the
//     whole set from one place is the only version of this that is complete.
//
//  3. A report is a single artefact. Half-publishing it is the failure
//     ReportsService.create() already refuses to commit ("ONE held photo holds
//     the whole report"), and the release path is the same decision run
//     backwards.
//
// The cost, stated plainly: an approval that does not release the report leaves
// no visible trace on `report_photos`. The trace is on `photo_uploads` —
// `reviewed_by_id`, `reviewed_at`, `review_reason` and the audit row — which is
// where a moderator's decision belongs anyway.

import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Request } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../db/schema/photo-verification-schema';
import {
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import { PHOTO_CAPTURE_UNVERIFIED } from '../reports/report-photos';
import { UPLOADS_DIR } from '../uploads/multer.config';
import { promoteToPublic } from '../uploads/quarantine-storage';
import { buildUploadUrl } from '../uploads/upload-url';

/**
 * A Drizzle executor — the `db` singleton or a transaction handle.
 *
 * Same type and the same reason as AdminAuditService's `Executor`: a release
 * that is not in the transaction that made the decision can be orphaned by a
 * rollback (a published report nobody decided to publish) or lost by a crash
 * between the two statements (a decision that never took effect). Callers pass
 * their `tx`.
 */
export type PhotoModerationExecutor = Pick<
  typeof db,
  'insert' | 'select' | 'update'
>;

/**
 * How the photos on one report currently stand.
 *
 * `awaitingReview` is the number the release rule turns on, and
 * `refused` is the number that keeps a report held even when nothing is
 * awaiting anything — a photo a moderator refused is resolved and NOT
 * publishable, and conflating the two would publish a report whose picture a
 * human had just declined.
 */
export interface ReportPhotoStanding {
  total: number;
  /** Machine-passed or human-approved. Everything here publishes on release. */
  publishable: number;
  /** No verdict a human has accepted yet. Blocks release. */
  awaitingReview: number;
  /** A moderator said no to this image. Blocks release, permanently. */
  refused: number;
}

@Injectable()
export class PhotoModerationService {
  /**
   * The standing of every upload linked to a report.
   *
   * Computed from `photo_verification_statuses.key` rather than from
   * `photo_uploads.decision`, and that distinction is the whole design:
   * `decision` is the MACHINE's verdict and is never overwritten, so it still
   * reads `review` on a photo a human has since approved. The status is the
   * current state. Reading `decision` here would hold a report forever on a
   * photo that was cleared minutes ago.
   *
   * `reviewedAt is null` is ANDed into `awaitingReview` as a belt-and-braces
   * term rather than as the primary test: the status is authoritative, and a row
   * that somehow carried both a moderator's timestamp and a `review_required`
   * status is one this rule must not treat as still-waiting-forever.
   */
  async standingFor(
    tx: PhotoModerationExecutor,
    reportId: string,
  ): Promise<ReportPhotoStanding> {
    const rows = await tx
      .select({
        statusKey: photoVerificationStatuses.key,
        reviewedAt: photoUploads.reviewedAt,
      })
      .from(photoUploads)
      .innerJoin(
        photoVerificationStatuses,
        eq(photoUploads.statusId, photoVerificationStatuses.id),
      )
      .where(eq(photoUploads.reportId, reportId));

    let publishable = 0;
    let awaitingReview = 0;
    let refused = 0;

    for (const row of rows) {
      if (row.statusKey === 'passed') publishable += 1;
      else if (row.statusKey === 'rejected') refused += 1;
      else if (row.reviewedAt === null) awaitingReview += 1;
      // A non-passed, non-rejected status that a human HAS reviewed is
      // deliberately counted as none of the three. It cannot arise from any
      // path in this codebase (every decision writes a terminal status
      // alongside the timestamp), and inventing a bucket for it would mean
      // guessing which way it should push the release rule.
    }

    return { total: rows.length, publishable, awaitingReview, refused };
  }

  /**
   * Publishes a held report if — and only if — every photo on it is resolved
   * and none was refused. Returns true when the report went live.
   *
   * THE FOUR CONDITIONS, each of which has a bug behind it:
   *
   *   stored status is `pending_review` — never resurrect. A report a moderator
   *     REJECTED still has publishable photos on it; without this term,
   *     approving a second photo on that report would flip a refused emergency
   *     request back to `open`. A `closed` or `completed` report must not be
   *     silently reopened either.
   *   not soft-deleted — an admin hid this report. Publishing it would undo a
   *     moderation action taken for a different reason entirely.
   *   nothing awaiting review — the rule the caller asked for.
   *   nothing refused — resolved is not the same as approved. See
   *     ReportPhotoStanding.
   *
   * The caller must already hold a row lock on the report (SELECT ... FOR
   * UPDATE). Without it, two moderators approving the last two outstanding
   * photos concurrently each read the other's photo as still awaiting under READ
   * COMMITTED, and the report is released by NEITHER — a report stuck pending
   * forever with nothing left to decide. The lock is the caller's job because
   * the caller is the one whose transaction has to hold it.
   */
  async publishIfReady(
    tx: PhotoModerationExecutor,
    reportId: string,
    req: Request,
  ): Promise<boolean> {
    const [report] = await tx
      .select({
        id: reports.id,
        deletedAt: reports.deletedAt,
        storedStatusKey: reportStatuses.key,
        createdAt: reports.createdAt,
        expiryAt: reports.expiryAt,
      })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, reportId));

    if (!report) return false;
    if (report.deletedAt !== null) return false;
    if (report.storedStatusKey !== 'pending_review') return false;

    const standing = await this.standingFor(tx, reportId);
    if (standing.awaitingReview > 0 || standing.refused > 0) return false;
    // A held report with nothing publishable on it cannot exist — `create()`
    // refuses an empty photo set — but releasing one would put a photoless
    // emergency card in front of volunteers, so the rule says so out loud.
    if (standing.publishable === 0) return false;

    await this.publishPhotos(tx, reportId, req);

    const openStatusId = await this.statusIdFor(tx, 'open');
    await tx
      .update(reports)
      .set({
        statusId: openStatusId,
        updatedAt: new Date(),
        ...restoredWindow(report.createdAt, report.expiryAt),
      })
      .where(eq(reports.id, reportId));

    return true;
  }

  /**
   * Moves every publishable upload into public storage and gives it a
   * `report_photos` row.
   *
   * Ordered oldest-first by id (uuidv7 is time-ordered) so the published photos
   * appear in the order the reporter captured them — `AdminReportsService`
   * and the citizen detail both sort photos by `created_at`, and inserting them
   * in a nondeterministic order would shuffle a report's pictures on every
   * release.
   */
  private async publishPhotos(
    tx: PhotoModerationExecutor,
    reportId: string,
    req: Request,
  ): Promise<void> {
    const publishable = await tx
      .select({
        id: photoUploads.id,
        storedFilename: photoUploads.storedFilename,
      })
      .from(photoUploads)
      .innerJoin(
        photoVerificationStatuses,
        eq(photoUploads.statusId, photoVerificationStatuses.id),
      )
      // `not exists` rather than a post-fetch filter: an upload that already has
      // a `report_photos` row has already been published, and re-publishing it
      // would mint a duplicate photo card. Reachable if a release is ever
      // retried, and free to rule out here.
      .where(
        and(
          eq(photoUploads.reportId, reportId),
          eq(photoVerificationStatuses.key, 'passed'),
          sql`not exists (
            select 1 from ${reportPhotos}
            where ${reportPhotos.uploadId} = ${photoUploads.id}
          )`,
        ),
      )
      .orderBy(photoUploads.id);

    const rows: (typeof reportPhotos.$inferInsert)[] = [];

    for (const upload of publishable) {
      const filename = await this.promoteOrRecover(upload.storedFilename);
      if (!filename) {
        // The row says the photo exists and the disk disagrees. Throwing rolls
        // the whole release back, which is the only honest response: publishing
        // a report whose photo is missing gives volunteers a broken card for a
        // real emergency. Same refusal, same reasoning, as publishUploads().
        throw new Error(
          `photo_uploads ${upload.id} has no file to publish (${upload.storedFilename})`,
        );
      }
      rows.push({
        id: uuidv7(),
        reportId,
        url: buildUploadUrl(req, filename),
        // Still the client's unverified claim. See report-photos.ts — a
        // moderator looking at the image establishes that it is acceptable,
        // never that a camera rather than a gallery produced it.
        capturedLive: PHOTO_CAPTURE_UNVERIFIED,
        uploadId: upload.id,
      });
    }

    if (rows.length > 0) await tx.insert(reportPhotos).values(rows);
  }

  /**
   * Promotes a quarantined file, tolerating one that is already public.
   *
   * WHY THE SECOND CHANCE EXISTS. The rename runs inside the caller's
   * transaction, so a commit that fails afterwards leaves the bytes in
   * UPLOADS_DIR while the database still believes nothing happened. Without this
   * check the retry finds nothing in quarantine, `promoteToPublic` returns
   * undefined, and that photo becomes permanently unapprovable — a held
   * emergency request no moderator can ever release. The recovery costs one
   * `existsSync`.
   *
   * The filename is generated by writeQuarantined (a randomUUID plus a sniffed
   * extension) and never leaves this API, so joining it here is not the
   * path-traversal risk it would be for client input; quarantine-storage's own
   * `safePathFor` remains the guard on the quarantine side.
   */
  private async promoteOrRecover(
    storedFilename: string,
  ): Promise<string | undefined> {
    const promoted = await promoteToPublic(storedFilename);
    if (promoted) return promoted;
    return publicPathFor(storedFilename) ? storedFilename : undefined;
  }

  private async statusIdFor(
    tx: PhotoModerationExecutor,
    key: string,
  ): Promise<string> {
    const [row] = await tx
      .select({ id: reportStatuses.id })
      .from(reportStatuses)
      .where(eq(reportStatuses.key, key));
    if (!row) {
      // Loud, matching AdminAuditService and PhotoVerificationService: an
      // unseeded lookup key is a deployment fault, and continuing would leave
      // the report held with its decision already recorded.
      throw new Error(
        `report_statuses row missing for key "${key}" — did db:seed run?`,
      );
    }
    return row.id;
  }
}

/**
 * Absolute path of an ALREADY-PUBLISHED photo, or undefined.
 *
 * The mirror of quarantine-storage's `quarantinePathFor`, and deliberately not
 * added to that file: this one resolves inside the publicly-served directory,
 * which is the exact thing that module exists to keep photos out of. Two
 * callers need it and both are about a photo that has legitimately left
 * quarantine — the release retry above, and the admin file route, which must
 * still show a moderator an image that has since gone live.
 *
 * The name comes from `photo_uploads.stored_filename`, which this API generated
 * and stored itself. The traversal characters are refused anyway, because a
 * database column is exactly the kind of "already safe" input that has put this
 * class of bug into production twice.
 */
export function publicPathFor(storedFilename: string): string | undefined {
  if (
    !storedFilename ||
    storedFilename.includes('/') ||
    storedFilename.includes('\\') ||
    storedFilename.includes('..') ||
    storedFilename.includes('\0')
  ) {
    return undefined;
  }
  const path = join(UPLOADS_DIR, storedFilename);
  return existsSync(path) ? path : undefined;
}

/**
 * Gives a report its publication window back if moderation outlasted it.
 *
 * THE PROBLEM THIS SOLVES, concretely:
 *
 *   10:00  citizen submits          -> pending_review
 *   10:30  expiry_at passes while it sits in the queue
 *   10:35  moderator approves       -> open, and INSTANTLY reads as expired
 *
 * The approval accomplished nothing. Nobody can accept the request, the
 * reporter waited on us and got a dead card, and the moderator has no way to
 * tell that their decision was pointless. `effectiveStatusSql` only maps a
 * STORED `open` to `expired`, so the report sat correctly as `pending_review`
 * the whole time it was queued — which is right, and which is exactly why the
 * problem only appears at the moment of release.
 *
 * THE RULE: the delay was ours, not the reporter's, so the clock restarts at
 * approval — but only if it had actually run out. A report approved inside its
 * window keeps the deadline the reporter chose; extending that one would hand
 * out free time nobody asked for and quietly contradict BR-2 (a reporter may
 * shorten the category default, never extend it).
 *
 * EXPORTED because there are TWO exits from `pending_review` and they must not
 * disagree: a moderator approving (`publishIfReady`, here) and the REPORTER
 * sending the replacement a moderator asked for (`ReportsService.
 * replaceHeldPhotos`). The second one originally wrote `open` itself and skipped
 * this, so a report the citizen resolved could publish already expired — the
 * exact outcome this function exists to prevent, and worse there, because
 * `request_new` is the only path that asks the citizen for more work and so is
 * the most likely to outlast a short window.
 *
 * The RESTORED window is the reporter's ORIGINAL duration, not the category
 * default: someone who deliberately chose a two-hour window for a fast-moving
 * situation should get two hours from approval, not the category's twelve.
 * That duration is recoverable as `expiry_at - created_at`, which is why both
 * columns are read.
 */
export function restoredWindow(
  createdAt: Date,
  expiryAt: Date,
): { expiryAt: Date } | Record<string, never> {
  const now = Date.now();
  if (expiryAt.getTime() > now) return {};

  const originalWindowMs = expiryAt.getTime() - createdAt.getTime();
  // A non-positive window should be impossible (create() derives expiry from a
  // positive number of minutes) but clamping beats emitting a timestamp in the
  // past and re-creating the exact bug this function exists to fix.
  const windowMs = originalWindowMs > 0 ? originalWindowMs : 60 * 60_000;
  return { expiryAt: new Date(now + windowMs) };
}
