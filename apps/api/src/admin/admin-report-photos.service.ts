import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../db/schema/photo-verification-schema';
import {
  reportCategories,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import { AlertsService } from '../alerts/alerts.service';
import {
  PhotoModerationService,
  publicPathFor,
} from '../moderation/photo-moderation.service';
import { effectiveStatusSql } from '../reports/report-effective-status';
import { quarantinePathFor } from '../uploads/quarantine-storage';
import { AdminAuditService } from './admin-audit.service';
import { likePattern, offsetFor, paginate } from './admin-pagination';
import type { AdminIdentity } from './admin-rbac';
import type { AdminRequestMeta } from './admin-request-meta';
import {
  AWAITING_DECISION_STATUS_KEYS,
  type ListReportPhotosDto,
} from './dto/list-report-photos.dto';
import type { ReportPhotoSummaryDto } from './dto/report-photo-summary.dto';
import type {
  ApproveReportPhotoDto,
  RefuseReportPhotoDto,
} from './dto/moderate-report-photo.dto';

/** A transaction handle, as `db.transaction` hands it to its callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The moderator who decided, joined separately from the reporter.
 *
 * `user` is already joined once for the reporter, so a second reference to the
 * same table needs an alias — without it Postgres resolves both `user.name`
 * columns to whichever join came first, and the console would show the
 * reporter's name in the "reviewed by" column. Silent, and wrong in the one
 * place an audit trail must not be.
 */
const reviewer = alias(user, 'reviewer');

/**
 * Risk as a sortable rank.
 *
 * `risk_level` is text, so `order by risk_level desc` yields medium, low, high —
 * alphabetical, and precisely inverted at the top of a triage queue, which is
 * the one place the ordering matters. Null (never analysed) ranks below `low`
 * rather than above `high`: a photo nothing has assessed is not a high-risk one.
 */
const RISK_RANK = sql`case ${photoUploads.riskLevel}
    when 'high' then 3
    when 'medium' then 2
    when 'low' then 1
    else 0
  end`;

/**
 * Reports -> Photo review. The human half of photo verification.
 *
 * A photo the model would not clear holds its ENTIRE report out of the public
 * feed (`ReportsService.create()` sets `pending_review`), so every row in this
 * queue is a real person's request for emergency help that nobody can see yet.
 * That framing decides several things below: the queue defaults to oldest-first,
 * the reporter is told what happened on every terminal outcome, and a decision
 * that cannot be applied is refused loudly rather than absorbed.
 *
 * THREE ACTIONS, AND WHAT SEPARATES THEM:
 *
 *   approve      the image is acceptable. The upload's status becomes `passed`;
 *                if that was the last thing the report was waiting on, the whole
 *                report publishes at once (PhotoModerationService).
 *   reject       the image is not acceptable and the request dies with it. The
 *                report moves to `rejected` — visible to its reporter, to nobody
 *                else, permanently.
 *   request_new  the image is not acceptable but the request might be. The
 *                report stays `pending_review` and the reporter is asked for a
 *                different photo.
 *
 * At the PHOTO level `reject` and `request_new` are the same verdict — this
 * image will not be published — and both write the `rejected` verification
 * status. What differs is the fate of the REPORT, which the report's own status
 * and the audit action already record. Giving them separate photo statuses would
 * have meant seeding a lookup row whose only job was to duplicate a distinction
 * two other columns make better.
 *
 * ⚠️ `photo_uploads.decision` IS NEVER WRITTEN HERE. It is the machine's verdict
 * and it stays whatever the model said, so "the model wanted a human, and a
 * human approved it" is still readable a year later. The human's verdict lives
 * in `status_id` plus `reviewed_by_id` / `reviewed_at` / `review_reason`, which
 * is exactly why photo-verification-schema.ts gave them separate columns.
 */
@Injectable()
export class AdminReportPhotosService {
  constructor(
    private readonly auditService: AdminAuditService,
    private readonly photoModeration: PhotoModerationService,
    private readonly alertsService: AlertsService,
  ) {}

  /**
   * The queue.
   *
   * ONLY UPLOADS ATTACHED TO A REPORT APPEAR. `photo_uploads.report_id` is null
   * for the whole window between capture and submission — which is the window
   * that table exists for — and a photo whose reporter abandoned the flow is not
   * something a moderator can decide anything about: there is no report to
   * publish it onto and nobody waiting on the answer. Listing them would fill a
   * work queue with rows whose only correct action is to ignore them. The
   * quarantine sweep owns their cleanup.
   */
  async list(query: ListReportPhotosDto) {
    const filters = [
      query.status === 'all'
        ? undefined
        : query.status === 'awaiting'
          ? // The resting view: everything still awaiting a human. `failed` has
            // to be in here — with no provider configured every photo is
            // recorded `failed`, so a `review_required`-only default would show
            // an empty queue while the whole backlog sat behind it.
            inArray(photoVerificationStatuses.key, [
              ...AWAITING_DECISION_STATUS_KEYS,
            ])
          : eq(photoVerificationStatuses.key, query.status),
      query.risk ? eq(photoUploads.riskLevel, query.risk) : undefined,
      query.categoryKey
        ? eq(reportCategories.key, query.categoryKey)
        : undefined,
      query.q
        ? or(
            ilike(reports.title, likePattern(query.q)),
            ilike(reports.description, likePattern(query.q)),
            ilike(reports.landmark, likePattern(query.q)),
          )
        : undefined,
      // Bounded on the UPLOAD's created_at, not the report's: a moderator asking
      // "what came in yesterday" means photos, and the two timestamps diverge
      // whenever a photo is added to a report after it was first submitted.
      query.from ? gte(photoUploads.createdAt, query.from) : undefined,
      query.to ? lte(photoUploads.createdAt, query.to) : undefined,
    ].filter((f) => f !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const direction = query.order === 'asc' ? asc : desc;
    const sortColumn =
      query.sort === 'verifiedAt'
        ? photoUploads.verifiedAt
        : query.sort === 'risk'
          ? RISK_RANK
          : photoUploads.createdAt;

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: photoUploads.id,
          reportId: photoUploads.reportId,
          reportTitle: reports.title,
          categoryKey: reportCategories.key,
          categoryLabel: reportCategories.label,
          reporterId: reports.reporterId,
          reporterName: user.name,
          createdAt: photoUploads.createdAt,
          verifiedAt: photoUploads.verifiedAt,
          verificationStatus: photoVerificationStatuses.key,
          decision: photoUploads.decision,
          riskLevel: photoUploads.riskLevel,
          reasons: photoUploads.reasons,
          reportStatus: effectiveStatusSql,
        })
        .from(photoUploads)
        .innerJoin(
          photoVerificationStatuses,
          eq(photoUploads.statusId, photoVerificationStatuses.id),
        )
        // innerJoin on reports — see the note on this method.
        .innerJoin(reports, eq(photoUploads.reportId, reports.id))
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        // leftJoin: reporter_id is SET NULL, so a photo whose reporter deleted
        // their account must still be reviewable. innerJoin would hide exactly
        // the rows nobody is left to chase.
        .leftJoin(user, eq(reports.reporterId, user.id))
        .where(where)
        // Tie-break on the upload id (uuidv7, time-ordered) so paging is stable
        // when two photos share a sort value. Without it a row can appear on two
        // pages, and in a work queue that means a photo decided twice.
        .orderBy(direction(sortColumn), asc(photoUploads.id))
        .limit(query.limit)
        .offset(offsetFor(query)),

      // The same joins again rather than a shared builder — the precedent
      // AdminReportsService sets, and for the same reason: a count that filters
      // differently from the page is a pagination bug nobody notices until the
      // last page is empty.
      db
        .select({ count: sql<string>`count(*)` })
        .from(photoUploads)
        .innerJoin(
          photoVerificationStatuses,
          eq(photoUploads.statusId, photoVerificationStatuses.id),
        )
        .innerJoin(reports, eq(photoUploads.reportId, reports.id))
        .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
        .innerJoin(
          reportCategories,
          eq(reports.categoryId, reportCategories.id),
        )
        .leftJoin(user, eq(reports.reporterId, user.id))
        .where(where),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        reportId: row.reportId,
        reportTitle: row.reportTitle,
        categoryKey: row.categoryKey,
        categoryLabel: row.categoryLabel,
        reporter: reporterProjection(row),
        createdAt: row.createdAt.toISOString(),
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        verificationStatus: row.verificationStatus,
        decision: row.decision,
        riskLevel: row.riskLevel,
        // Codes, never prose — the console renders its own wording, exactly as
        // the mobile app renders its own. Null (an upload with no recorded
        // verdict) becomes [] so the client has one shape to handle.
        reasons: row.reasons ?? [],
        reportStatus: row.reportStatus,
      })),
      Number(countRow?.count ?? 0),
      query,
    );
  }

  /**
   * The three numbers behind the sidebar badge and the queue's summary cards.
   *
   * ONE STATEMENT, THREE AGGREGATES. `count(*) filter (where ...)` makes each
   * card a predicate over a single scan rather than three round trips that can
   * each observe a different instant — a badge saying 7 above a card saying 6 is
   * read as a bug in the queue, not as two queries a moderator's decision landed
   * between.
   *
   * EACH NUMBER'S DEFINITION IS THE INTERESTING PART, because a summary card
   * that counts something slightly different from the list it sits above is
   * worse than no card at all:
   *
   *   pendingReview  EXACTLY the population `list()` returns with its default
   *                  filter — attached to a report, the `awaiting` union (`review_required` + `failed`).
   *                  Tied deliberately: the badge is a promise about what the
   *                  moderator will find when they click it.
   *   highRisk       a SUBSET of pendingReview, not an all-time tally. A card
   *                  counting every high-risk photo ever uploaded would only
   *                  ever go up, and a number that never falls is not a work
   *                  signal — it is decoration.
   *   today          arrivals, any status, in the moderator's own day. This one
   *                  is throughput rather than backlog: it answers "is the queue
   *                  building up or draining", which neither of the others can.
   *
   * All three are scoped to uploads attached to a report, for the same reason
   * `list()` is — see the note there.
   */
  async summary(query: ReportPhotoSummaryDto) {
    const { timeZone } = query;

    // The same conversion AdminDashboardService uses: `col AT TIME ZONE $tz`
    // renders a timestamptz as local wall-clock time, and ::date truncates to
    // the calendar day THERE. Comparing against now() through the same
    // conversion is what makes "today" mean the reader's today, not UTC's.
    const isToday = sql`(${photoUploads.createdAt} AT TIME ZONE ${timeZone})::date
      = (now() AT TIME ZONE ${timeZone})::date`;
    // BOTH statuses that still need a human, and `reviewed_at is null` so a
    // decided photo stops being counted.
    //
    // ⚠️ THIS COUNTED ONLY `review_required` AND WAS WRONG IN THE MOST
    // DANGEROUS DIRECTION. A photo whose provider call never completed is
    // recorded `failed`, not `review_required` — and with no AWS credentials
    // configured, which is every environment today, that is 100% of the queue.
    // The badge and the summary card therefore read ZERO while the queue held
    // twelve reports awaiting moderation. Observed live against the running
    // container, not reasoned about: `summary` returned `pendingReview: 0` while
    // `list()` returned rows on the same data.
    //
    // Same defect the list's default filter had, in a second place — which is
    // the argument for `AWAITING_DECISION_STATUS_KEYS` being one shared
    // constant rather than a condition each query spells out for itself.
    const awaiting = sql`${photoVerificationStatuses.key} in ${AWAITING_DECISION_STATUS_KEYS} and ${photoUploads.reviewedAt} is null`;

    const [row] = await db
      .select({
        pendingReview: sql<string>`count(*) filter (where ${awaiting})`,
        highRisk: sql<string>`count(*) filter (where ${awaiting} and ${photoUploads.riskLevel} = 'high')`,
        today: sql<string>`count(*) filter (where ${isToday})`,
      })
      .from(photoUploads)
      .innerJoin(
        photoVerificationStatuses,
        eq(photoUploads.statusId, photoVerificationStatuses.id),
      )
      .innerJoin(reports, eq(photoUploads.reportId, reports.id));

    return {
      pendingReview: Number(row?.pendingReview ?? 0),
      highRisk: Number(row?.highRisk ?? 0),
      today: Number(row?.today ?? 0),
      // Echoed back so the console can label the card honestly instead of
      // assuming the server agreed with it about where the day starts.
      timeZone,
    };
  }

  /**
   * One photo, with everything a moderator needs and nothing a citizen may see.
   *
   * `signals`, `provider` and the two model versions are precisely the detail
   * PhotoVerificationService withholds from the upload response — "a citizen who
   * learns that Explicit at 79 passes has learned how to tune a photograph until
   * it does". They belong here, behind `reports:manage`, and nowhere else.
   */
  async findOne(uploadId: string) {
    const row = await loadUpload(uploadId);

    const [judged] = row.judgedCategoryId
      ? await db
          .select({ key: reportCategories.key, label: reportCategories.label })
          .from(reportCategories)
          .where(eq(reportCategories.id, row.judgedCategoryId))
      : [];

    // What approving this photo would actually DO. Without it the console can
    // only render "Approve" and hope: the same click either publishes the report
    // or changes nothing visible, depending on sibling photos the moderator is
    // not currently looking at.
    const standing = row.reportId
      ? await this.photoModeration.standingFor(db, row.reportId)
      : null;

    return {
      id: row.id,
      reportId: row.reportId,
      reportTitle: row.reportTitle,
      categoryKey: row.categoryKey,
      categoryLabel: row.categoryLabel,
      reporter: reporterProjection(row),
      createdAt: row.createdAt.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      verificationStatus: row.verificationStatus,
      verificationStatusLabel: row.verificationStatusLabel,
      decision: row.decision,
      riskLevel: row.riskLevel,
      reasons: row.reasons ?? [],
      signals: row.signals,
      provider: row.provider,
      moderationModelVersion: row.moderationModelVersion,
      labelModelVersion: row.labelModelVersion,
      unavailableReason: row.unavailableReason,
      width: row.width,
      height: row.height,
      byteSize: row.byteSize,
      mimeType: row.mimeType,
      /**
       * The category relevance was JUDGED against, which is not necessarily the
       * report's category today — see photo-verification-schema.ts. A
       * `category-mismatch` reason is uninterpretable without it, and reading it
       * off the report instead would quietly rewrite history the moment a
       * reporter switched category.
       */
      judgedCategory: judged ? { key: judged.key, label: judged.label } : null,
      reviewedBy:
        row.reviewedById === null
          ? null
          : { id: row.reviewedById, name: row.reviewedByName },
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewReason: row.reviewReason,
      reportStatus: row.reportStatus,
      report:
        row.reportId === null
          ? null
          : {
              id: row.reportId,
              title: row.reportTitle,
              description: row.reportDescription,
              landmark: row.reportLandmark,
              lat: row.reportLat,
              lng: row.reportLng,
              createdAt: row.reportCreatedAt?.toISOString() ?? null,
              status: row.reportStatus,
              storedStatus: row.reportStoredStatus,
              reporter: reporterProjection(row),
              photos: standing,
            },
    };
  }

  /**
   * The bytes, for an authorised admin, and the ONLY way anybody sees them.
   *
   * A quarantined photo has no public URL by design — that is the entire reason
   * QUARANTINE_DIR sits outside the statically-served directory — so this is not
   * a convenience over an existing link, it is the only link there is. Returning
   * the path rather than streaming keeps the response headers in the controller,
   * where `Cache-Control: private, no-store` belongs.
   *
   * FALLS BACK TO PUBLIC STORAGE for a photo that has since been published.
   * After a release the same bytes are world-readable at their `report_photos`
   * URL, so refusing here would hide from a moderator reviewing their own past
   * decision an image every citizen can already fetch — while telling them the
   * photo was missing.
   */
  async fileFor(uploadId: string) {
    const [upload] = await db
      .select({
        storedFilename: photoUploads.storedFilename,
        mimeType: photoUploads.mimeType,
      })
      .from(photoUploads)
      .where(eq(photoUploads.id, uploadId));

    const path =
      upload &&
      (quarantinePathFor(upload.storedFilename) ??
        publicPathFor(upload.storedFilename));

    if (!path) {
      // One 404 for "no such upload" and for "the row is here, the file is not".
      // The second is what a rejected photo looks like once the quarantine sweep
      // has removed it, and the console has the same thing to show either way:
      // nothing.
      throw new NotFoundException({
        code: 'PHOTO_FILE_NOT_FOUND',
        message: 'No image is available for this upload.',
      });
    }

    return { path, mimeType: upload.mimeType };
  }

  /**
   * The image is acceptable. Publishes the whole report if this was the last
   * thing it was waiting on.
   *
   * The reporter is alerted ONLY when the report actually goes live. "Your photo
   * was approved", sent about a report still held by a second photo, is a fact
   * they can do nothing with and a claim about something still invisible to
   * everyone — so the alert follows the outcome that matters, and the approval
   * that finally releases the report is the one that sends it.
   *
   * ⚠️ CATEGORY RELEVANCE IS NOT RE-DERIVED HERE, AND MUST NOT BE. A photo can
   * reach this queue precisely BECAUSE its capture-time category differs from
   * the one the report was filed under — `resolveUploads` holds on that
   * mismatch, closing a bypass where a client uploaded under a category with no
   * expected labels and then filed under one that has them. The response to that
   * hold is a human looking at the actual image, which is a stronger check than
   * the label heuristic, so re-running relevance at approval time would let the
   * machine overrule the person the hold existed to summon. Approve publishes
   * what the moderator saw. `photo_uploads.category_id` stays exactly as
   * recorded — it is the question the verdict answered, not a field to correct.
   */
  async approve(
    admin: AdminIdentity,
    uploadId: string,
    dto: ApproveReportPhotoDto,
    req: Request,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireDecidable(uploadId);

    if (dto.reportId && dto.reportId !== current.reportId) {
      throw new ConflictException({
        code: 'PHOTO_REPORT_MISMATCH',
        message:
          'This photo is not attached to that report. Reload the queue and try again.',
      });
    }

    let released = false;

    await db.transaction(async (tx) => {
      await this.lockReport(tx, current.reportId);
      await this.claim(tx, admin, current, 'passed', dto.reason ?? null);

      released = await this.photoModeration.publishIfReady(
        tx,
        current.reportId,
        req,
      );

      await this.auditService.record({
        admin,
        action: 'report_photo.approve',
        targetId: uploadId,
        targetLabel: current.reportTitle,
        before: auditBefore(current),
        after: {
          verificationStatus: 'passed',
          reportStatus: released ? 'open' : current.reportStoredStatus,
          // The single most useful thing this row can say. Two identical-looking
          // approvals differ entirely in consequence, and only this tells them
          // apart afterwards.
          reportReleased: released,
        },
        reason: dto.reason ?? null,
        meta,
        tx,
      });
    });

    if (released) {
      // The only one of the three alerts that may carry a reportId — see
      // notifyReporter().
      await this.notifyReporter(
        current,
        'report_photo_approved',
        current.reportId,
      );
    }

    return this.findOne(uploadId);
  }

  /**
   * The image is not acceptable and the request dies with it.
   *
   * THE FILE IS DELIBERATELY NOT DELETED. A rejection is the decision most
   * likely to be appealed and the bytes are the evidence — destroying them here
   * would destroy the only thing that could show the decision was right. The
   * quarantine sweep owns removal, on its own schedule, after a retention
   * window this endpoint has no business shortening.
   */
  async reject(
    admin: AdminIdentity,
    uploadId: string,
    dto: RefuseReportPhotoDto,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireDecidable(uploadId);

    await db.transaction(async (tx) => {
      await this.lockReport(tx, current.reportId);
      await this.claim(tx, admin, current, 'rejected', dto.reason);

      // Only from `pending_review`. A sibling photo may have already moved the
      // report to `rejected`, and writing it a second time would be a no-op that
      // reads in the audit diff like a fresh decision.
      if (current.reportStoredStatus === 'pending_review') {
        await tx
          .update(reports)
          .set({
            statusId: await reportStatusIdFor('rejected'),
            updatedAt: new Date(),
          })
          .where(eq(reports.id, current.reportId));
      }

      await this.auditService.record({
        admin,
        action: 'report_photo.reject',
        targetId: uploadId,
        targetLabel: current.reportTitle,
        before: auditBefore(current),
        after: { verificationStatus: 'rejected', reportStatus: 'rejected' },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    await this.notifyReporter(current, 'report_photo_rejected', null);
    return this.findOne(uploadId);
  }

  /**
   * The image is not acceptable but the request might be.
   *
   * The report's status is NOT WRITTEN AT ALL — not even to the value it already
   * holds. That absence is the point: a reader comparing this method with
   * reject() can see at a glance that one ends the request and the other leaves
   * it exactly where it was, waiting on the reporter.
   */
  async requestNew(
    admin: AdminIdentity,
    uploadId: string,
    dto: RefuseReportPhotoDto,
    meta?: AdminRequestMeta,
  ) {
    const current = await this.requireDecidable(uploadId);

    await db.transaction(async (tx) => {
      await this.lockReport(tx, current.reportId);
      await this.claim(tx, admin, current, 'rejected', dto.reason);

      await this.auditService.record({
        admin,
        action: 'report_photo.request_new',
        targetId: uploadId,
        targetLabel: current.reportTitle,
        before: auditBefore(current),
        after: {
          verificationStatus: 'rejected',
          // Recorded rather than omitted: "the report did not move" is the fact
          // that distinguishes this action from `report_photo.reject` in the log.
          reportStatus: current.reportStoredStatus,
        },
        reason: dto.reason,
        meta,
        tx,
      });
    });

    await this.notifyReporter(
      current,
      'report_photo_replacement_requested',
      null,
    );
    return this.findOne(uploadId);
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /**
   * Records the human verdict, refusing a stale one.
   *
   * THE WHERE CLAUSE IS THE CONCURRENCY CONTROL, not the read in
   * requireDecidable(). That read happens before the transaction opens, so
   * between it and this statement a second moderator can decide the same photo
   * and a re-link can move it to a different report. Pinning both `report_id`
   * and `reviewed_at is null` here means the loser of that race updates zero
   * rows and is told so — instead of overwriting a colleague's decision,
   * publishing on the strength of it, and sending the reporter a second,
   * contradictory alert.
   *
   * `decision` is conspicuously absent from the SET. See the class comment.
   */
  private async claim(
    tx: Tx,
    admin: AdminIdentity,
    current: DecidableUpload,
    statusKey: 'passed' | 'rejected',
    reason: string | null,
  ): Promise<void> {
    const reviewedAt = new Date();

    const claimed = await tx
      .update(photoUploads)
      .set({
        statusId: await verificationStatusIdFor(statusKey),
        reviewedById: admin.userId,
        reviewedAt,
        reviewReason: reason,
        updatedAt: reviewedAt,
      })
      .where(
        and(
          eq(photoUploads.id, current.id),
          eq(photoUploads.reportId, current.reportId),
          isNull(photoUploads.reviewedAt),
        ),
      )
      .returning({ id: photoUploads.id });

    if (claimed.length === 0) {
      throw new ConflictException({
        code: 'PHOTO_ALREADY_REVIEWED',
        message:
          'This photo has already been reviewed. Reload the queue to see the current decision.',
      });
    }
  }

  /**
   * Serialises every decision on one report.
   *
   * Without it, two moderators approving the last two outstanding photos at the
   * same moment each read the other's photo as still awaiting review under READ
   * COMMITTED, so NEITHER releases the report: it stays held forever with
   * nothing left to decide and no error anywhere to explain why. A row lock on
   * the report is the cheapest fix and the natural one — the report is what the
   * two decisions are really contending over.
   */
  private async lockReport(tx: Tx, reportId: string): Promise<void> {
    await tx
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.id, reportId))
      .for('update');
  }

  /**
   * Loads a photo a decision may actually be applied to.
   *
   * Each refusal is a 409 with its own code, because each has a different fix
   * and a console that cannot tell them apart shows "something went wrong" for
   * all four:
   *
   *   PHOTO_NOT_ATTACHED         the upload was never submitted with a report.
   *                              Nothing to publish it onto, nobody waiting.
   *   PHOTO_ALREADY_REVIEWED     somebody already decided this. Reload.
   *   REPORT_HIDDEN              an admin removed the report. Reinstate it first
   *                              — the same code and the same precedent as
   *                              AdminReportModerationService.
   *   REPORT_NOT_PENDING_REVIEW  the report has published or concluded. A photo
   *                              verdict now would either un-publish live
   *                              content — which is `report.hide`'s job, with
   *                              its own audit action and its own reason — or
   *                              decide nothing at all.
   *
   * `rejected` is allowed through alongside `pending_review` so a moderator can
   * still clear the remaining photos of a report a sibling already killed.
   * Nothing can be resurrected that way: publishIfReady() requires
   * `pending_review`, so approving one of those updates the photo's own record
   * and changes nothing else, which is the honest outcome rather than a refusal
   * that leaves un-actionable rows sitting in the queue forever.
   */
  private async requireDecidable(uploadId: string): Promise<DecidableUpload> {
    const row = await loadUpload(uploadId);
    const reportId = row.reportId;

    if (reportId === null) {
      throw new ConflictException({
        code: 'PHOTO_NOT_ATTACHED',
        message: 'This photo was never submitted with a report.',
      });
    }
    if (row.reviewedAt !== null) {
      throw new ConflictException({
        code: 'PHOTO_ALREADY_REVIEWED',
        message:
          'This photo has already been reviewed. Reload the queue to see the current decision.',
      });
    }
    if (row.reportDeletedAt !== null) {
      throw new ConflictException({
        code: 'REPORT_HIDDEN',
        message: 'Reinstate this report before deciding on its photos.',
      });
    }
    if (
      row.reportStoredStatus !== 'pending_review' &&
      row.reportStoredStatus !== 'rejected'
    ) {
      throw new ConflictException({
        code: 'REPORT_NOT_PENDING_REVIEW',
        message: 'This report is no longer awaiting photo review.',
      });
    }

    return { ...row, reportId };
  }

  /**
   * Tells the reporter what happened to their request.
   *
   * ⚠️ `reportId` IS NULL FOR TWO OF THE THREE, AND THAT IS LOAD-BEARING.
   * `AlertsService.list()` drops an alert whose report fails `notRemoved`, and
   * `notRemoved` covers the PRE-PUBLICATION statuses as well as soft deletes
   * (report-visibility.ts). Both `pending_review` and `rejected` are
   * pre-publication. So an alert saying "your request was not published",
   * linked to the very report that was not published, would be filtered out of
   * the reporter's own alert list and they would never see it — the row would
   * exist in Postgres, the push would fire, and the app would show nothing.
   * That is worse than not sending it at all, because every part of the system
   * would look like it had worked.
   *
   * Only the approval alert carries a reportId: by the time it is sent the
   * report is `open`, so the link both survives the filter and goes somewhere.
   *
   * Outside the transaction, like every other alert in this codebase: a failed
   * notification must not roll back a completed moderation decision.
   *
   * A null `reporterId` means the account has been deleted. There is nobody to
   * tell, and the decision still stands.
   */
  private async notifyReporter(
    current: DecidableUpload,
    type:
      | 'report_photo_approved'
      | 'report_photo_rejected'
      | 'report_photo_replacement_requested',
    reportId: string | null,
  ): Promise<void> {
    if (current.reporterId === null) return;

    await this.alertsService.create(
      current.reporterId,
      type,
      // `volunteerName` has no meaning for a moderation outcome — there is no
      // third party involved — so it is null, exactly as `report_cancelled`
      // leaves it.
      { volunteerName: null, reportTitle: current.reportTitle ?? '' },
      reportId ?? undefined,
    );
  }
}

/**
 * The reporter, for staff.
 *
 * `reports.anonymous` is NOT consulted, matching AdminReportsService's
 * documented call: staff see the identity behind an anonymous report, because
 * `GET /admin/users/:id` already lists it and redacting one screen while the
 * next one shows it is theatre rather than protection. Open question 2 in
 * docs/_audit/open-questions.md — if it is ever settled the other way, both
 * projections change together.
 */
function reporterProjection(row: {
  reporterId: string | null;
  reporterName: string | null;
}) {
  if (row.reporterId === null) return null;
  return { id: row.reporterId, name: row.reporterName };
}

/**
 * The snapshot every photo decision records.
 *
 * `machineDecision` and `riskLevel` are in here because this row is where "what
 * did the model say, and did the human agree with it" gets answered — the pair
 * of facts that would otherwise be lost the moment somebody re-tunes a
 * threshold. `storedFilename` because a report can carry four photos and the
 * entry has to say which one this was about.
 */
function auditBefore(current: DecidableUpload) {
  return {
    reportId: current.reportId,
    storedFilename: current.storedFilename,
    verificationStatus: current.verificationStatus,
    machineDecision: current.decision,
    riskLevel: current.riskLevel,
    reasons: current.reasons ?? [],
    reportStatus: current.reportStoredStatus,
    reviewedAt: null,
  };
}

/**
 * One upload with its report context.
 *
 * A module-level function rather than a private method so `UploadRow` below can
 * be derived from its return type — thirty-odd columns that would otherwise have
 * to be restated by hand in an interface, where they would drift from the select
 * the first time a column was added.
 */
async function loadUpload(uploadId: string) {
  const [row] = await db
    .select({
      id: photoUploads.id,
      uploaderId: photoUploads.uploaderId,
      judgedCategoryId: photoUploads.categoryId,
      storedFilename: photoUploads.storedFilename,
      mimeType: photoUploads.mimeType,
      byteSize: photoUploads.byteSize,
      width: photoUploads.width,
      height: photoUploads.height,
      decision: photoUploads.decision,
      riskLevel: photoUploads.riskLevel,
      reasons: photoUploads.reasons,
      signals: photoUploads.signals,
      provider: photoUploads.provider,
      moderationModelVersion: photoUploads.moderationModelVersion,
      labelModelVersion: photoUploads.labelModelVersion,
      unavailableReason: photoUploads.unavailableReason,
      verifiedAt: photoUploads.verifiedAt,
      createdAt: photoUploads.createdAt,
      reviewedById: photoUploads.reviewedById,
      reviewedByName: reviewer.name,
      reviewedAt: photoUploads.reviewedAt,
      reviewReason: photoUploads.reviewReason,
      verificationStatus: photoVerificationStatuses.key,
      verificationStatusLabel: photoVerificationStatuses.label,

      reportId: photoUploads.reportId,
      reportTitle: reports.title,
      reportDescription: reports.description,
      reportLandmark: reports.landmark,
      reportLat: reports.lat,
      reportLng: reports.lng,
      reportCreatedAt: reports.createdAt,
      reportDeletedAt: reports.deletedAt,
      reportStoredStatus: reportStatuses.key,
      reportStatus: effectiveStatusSql,
      categoryKey: reportCategories.key,
      categoryLabel: reportCategories.label,
      reporterId: reports.reporterId,
      reporterName: user.name,
    })
    .from(photoUploads)
    .innerJoin(
      photoVerificationStatuses,
      eq(photoUploads.statusId, photoVerificationStatuses.id),
    )
    // leftJoin all the way down the report side: an upload with no report is a
    // legitimate state — capture happens before submission, which is the whole
    // reason `photo_uploads` exists — and an innerJoin would turn "never
    // submitted" into "does not exist", a 404 for a row sitting right there.
    .leftJoin(reports, eq(photoUploads.reportId, reports.id))
    .leftJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
    .leftJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
    .leftJoin(user, eq(reports.reporterId, user.id))
    .leftJoin(reviewer, eq(photoUploads.reviewedById, reviewer.id))
    .where(eq(photoUploads.id, uploadId));

  if (!row) {
    throw new NotFoundException({
      code: 'PHOTO_UPLOAD_NOT_FOUND',
      message: 'No photo upload with that id.',
    });
  }

  return row;
}

type UploadRow = Awaited<ReturnType<typeof loadUpload>>;

/** An upload that passed every precondition in requireDecidable(). */
type DecidableUpload = UploadRow & { reportId: string };

async function verificationStatusIdFor(key: string): Promise<string> {
  const [row] = await db
    .select({ id: photoVerificationStatuses.id })
    .from(photoVerificationStatuses)
    .where(eq(photoVerificationStatuses.key, key));
  if (!row) {
    // Loud, matching AdminAuditService and PhotoVerificationService: an unseeded
    // lookup key is a deployment fault, and continuing would record a decision
    // in a state nothing can interpret.
    throw new Error(
      `photo_verification_statuses row missing for key "${key}" — did db:seed run?`,
    );
  }
  return row.id;
}

async function reportStatusIdFor(key: string): Promise<string> {
  const [row] = await db
    .select({ id: reportStatuses.id })
    .from(reportStatuses)
    .where(eq(reportStatuses.key, key));
  if (!row) {
    throw new Error(
      `report_statuses row missing for key "${key}" — did db:seed run?`,
    );
  }
  return row.id;
}
