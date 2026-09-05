import 'dotenv/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_admin_report_photos_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { alerts } from '../db/schema/alerts-schema';
import { adminAuditLogs } from '../db/schema/audit-schema';
import {
  photoUploads,
  photoVerificationStatuses,
} from '../db/schema/photo-verification-schema';
import {
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import { AlertsService } from '../alerts/alerts.service';
import { PhotoModerationService } from '../moderation/photo-moderation.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
import { QUARANTINE_DIR } from '../uploads/quarantine-storage';
import {
  createPhotoUploadFixture,
  removePhotoUploadFixture,
} from '../uploads/testing/photo-upload-fixture';
import { AdminAuditService } from './admin-audit.service';
import { AdminReportPhotosService } from './admin-report-photos.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_admin_report_photos_test';
const HOUR = 60 * 60 * 1000;

/**
 * The human half of photo verification, walked end to end.
 *
 * WHAT THESE CASES ARE REALLY PROTECTING. A held report is invisible to every
 * citizen and fully visible to its reporter, so both failure directions are
 * silent: a photo that publishes when it should not is a moderation bypass
 * nobody sees, and a report that never releases is an emergency request that
 * quietly never happens. Neither shows up as an error anywhere. Every assertion
 * below is one of those two, made loud.
 *
 * The database is rebuilt from migration 0000 per run, per the note in
 * admin-spec-db.ts.
 */
describe('AdminReportPhotosService', () => {
  const auditService = new AdminAuditService();
  const photoModeration = new PhotoModerationService();
  const alertsService = new AlertsService();
  const service = new AdminReportPhotosService(
    auditService,
    photoModeration,
    alertsService,
  );

  // `get` returning undefined makes upload-url.ts fall back to
  // BETTER_AUTH_URL, which is deterministic — the alternative depends on
  // whichever Host a test happened to fake. Same choice as
  // report-photo-gate.spec.ts.
  const req = { get: () => undefined } as unknown as Request;

  let lookups: Awaited<ReturnType<typeof seedLookups>>;
  const reporterId = uuidv7();
  const adminUserId = uuidv7();
  const admin = fakeAdmin({
    userId: adminUserId,
    name: 'Super Admin',
    email: 'admin@uthavu.org',
  });

  let reportId: string;
  const fixtures: string[] = [];

  /** A verified upload plus its quarantined file, attached to `reportId`. */
  async function attachedUpload(
    decision: 'pass' | 'review' | 'reject' = 'review',
    attachTo: string | null = reportId,
  ): Promise<string> {
    // Named after this suite — QUARANTINE_DIR is one directory shared by every
    // Jest worker, so a generic name would collide with another suite's file
    // mid-run and fail in a way that looks like the gate misfiring.
    const filename = `admin-report-photos-${uuidv7()}.jpg`;
    fixtures.push(filename);

    const uploadId = await createPhotoUploadFixture({
      uploaderId: reporterId,
      filename,
      decision,
      categoryId: lookups.categoryIds.medicalHelp,
    });
    if (attachTo) {
      await db
        .update(photoUploads)
        .set({ reportId: attachTo })
        .where(eq(photoUploads.id, uploadId));
    }
    return uploadId;
  }

  async function storedReport(id: string = reportId) {
    const [row] = await db
      .select({
        key: reportStatuses.key,
        deletedAt: reports.deletedAt,
      })
      .from(reports)
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .where(eq(reports.id, id));
    return row;
  }

  async function uploadRow(uploadId: string) {
    const [row] = await db
      .select({
        decision: photoUploads.decision,
        reviewedById: photoUploads.reviewedById,
        reviewedAt: photoUploads.reviewedAt,
        reviewReason: photoUploads.reviewReason,
        statusKey: photoVerificationStatuses.key,
        storedFilename: photoUploads.storedFilename,
      })
      .from(photoUploads)
      .innerJoin(
        photoVerificationStatuses,
        eq(photoUploads.statusId, photoVerificationStatuses.id),
      )
      .where(eq(photoUploads.id, uploadId));
    return row;
  }

  async function createHeldReport(): Promise<string> {
    const id = uuidv7();
    await db.insert(reports).values({
      id,
      reporterId,
      categoryId: lookups.categoryIds.medicalHelp,
      statusId: lookups.reportStatusIds.pending_review,
      title: 'Blood needed at Apollo',
      description: 'O negative urgently required.',
      landmark: 'Near the bus stand',
      lat: 13.08,
      lng: 80.27,
      expiryAt: new Date(Date.now() + HOUR),
    });
    return id;
  }

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);
    await db.insert(user).values([
      { id: reporterId, name: 'Hari S', email: 'hari@test.local' },
      { id: adminUserId, name: 'Super Admin', email: 'admin@uthavu.org' },
    ]);
  });

  afterAll(async () => {
    for (const filename of fixtures) removePhotoUploadFixture(filename);
    await db.$client.end();
  });

  beforeEach(async () => {
    await db.delete(alerts);
    await db.delete(adminAuditLogs);
    await db.delete(photoUploads);
    await db.delete(reportPhotos);
    await db.delete(reports);
    reportId = await createHeldReport();
  });

  describe('approve', () => {
    it('publishes the photo and releases the report', async () => {
      const uploadId = await attachedUpload('review');

      const result = await service.approve(admin, uploadId, {}, req);

      expect((await storedReport()).key).toBe('open');
      const photos = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, reportId));
      expect(photos).toHaveLength(1);
      expect(photos[0].uploadId).toBe(uploadId);
      // The client's unverified claim, carried through unchanged — a moderator
      // establishes that an image is acceptable, never that a camera produced it.
      expect(photos[0].capturedLive).toBe(true);
      expect(result.report?.status).toBe('open');
    });

    it('gives a report its window back when moderation outlasted it', async () => {
      // 10:00 submit -> pending_review; 10:30 expiry passes while queued;
      // 10:35 approve -> without this, the report goes `open` and INSTANTLY
      // reads `expired`. The approval would accomplish nothing: nobody could
      // accept it, and the moderator would have no way to tell.
      const uploadId = await attachedUpload('review');
      const originalWindowMs = 2 * 60 * 60_000;
      const createdAt = new Date(Date.now() - 5 * 60 * 60_000);
      await db
        .update(reports)
        .set({
          createdAt,
          expiryAt: new Date(createdAt.getTime() + originalWindowMs),
        })
        .where(eq(reports.id, reportId));

      const before = Date.now();
      await service.approve(admin, uploadId, {}, req);

      const [row] = await db
        .select({ expiryAt: reports.expiryAt })
        .from(reports)
        .where(eq(reports.id, reportId));
      expect((await storedReport()).key).toBe('open');
      expect(row.expiryAt.getTime()).toBeGreaterThan(before);
      // The REPORTER's original duration, not the category default: someone who
      // deliberately chose two hours for a fast-moving situation should get two
      // hours from approval, not the category's twelve.
      expect(
        Math.abs(row.expiryAt.getTime() - (before + originalWindowMs)),
      ).toBeLessThan(10_000);
    });

    it('does NOT extend a report approved inside its window', async () => {
      // Handing out free time nobody asked for would quietly contradict BR-2:
      // a reporter may shorten the category default, never extend it.
      const uploadId = await attachedUpload('review');
      const untouched = new Date(Date.now() + 3 * 60 * 60_000);
      await db
        .update(reports)
        .set({ expiryAt: untouched })
        .where(eq(reports.id, reportId));

      await service.approve(admin, uploadId, {}, req);

      const [row] = await db
        .select({ expiryAt: reports.expiryAt })
        .from(reports)
        .where(eq(reports.id, reportId));
      expect(row.expiryAt.getTime()).toBe(untouched.getTime());
    });

    // ── PV-17 boundary cases, stated as clock times ──────────────────────
    // These three pin the rule so a future change cannot quietly move it. The
    // window is the REPORTER's original duration (expiry_at - created_at), and
    // it is restored ONLY if it had already closed.
    describe('PV-17 — the expiry boundary', () => {
      /** Sets a report's clock explicitly, in hours relative to now. */
      async function clock(createdHoursAgo: number, windowHours: number) {
        const createdAt = new Date(Date.now() - createdHoursAgo * 3_600_000);
        await db
          .update(reports)
          .set({
            createdAt,
            expiryAt: new Date(createdAt.getTime() + windowHours * 3_600_000),
          })
          .where(eq(reports.id, reportId));
        return createdAt;
      }

      async function expiryAfterApproval(uploadId: string): Promise<number> {
        await service.approve(admin, uploadId, {}, req);
        const [row] = await db
          .select({ expiryAt: reports.expiryAt })
          .from(reports)
          .where(eq(reports.id, reportId));
        return row.expiryAt.getTime();
      }

      it('created 10:00, expires 12:00, approved 11:00 -> still expires 12:00', async () => {
        // Inside the window: untouched. Extending here would hand out time
        // nobody asked for and contradict BR-2, which lets a reporter SHORTEN
        // the category default and never lengthen it.
        const uploadId = await attachedUpload('review');
        const createdAt = await clock(1, 2); // 1h ago, 2h window -> 1h remaining
        const untouched = createdAt.getTime() + 2 * 3_600_000;

        expect(await expiryAfterApproval(uploadId)).toBe(untouched);
      });

      it('created 10:00, expires 12:00, approved 13:00 -> expires 15:00', async () => {
        // Closed 1h ago, original window 2h -> 2h from approval.
        const uploadId = await attachedUpload('review');
        await clock(3, 2); // created 3h ago, expired 1h ago
        const approvedAt = Date.now();

        const expiry = await expiryAfterApproval(uploadId);
        expect(Math.abs(expiry - (approvedAt + 2 * 3_600_000))).toBeLessThan(
          10_000,
        );
      });

      it('created 10:00, expires 10:30, approved 13:00 -> expires 13:30', async () => {
        // A SHORT original window stays short. Somebody who deliberately chose
        // 30 minutes for a fast-moving situation gets 30 minutes from approval,
        // not the category default and not an arbitrary fixed window.
        const uploadId = await attachedUpload('review');
        await clock(3, 0.5); // created 3h ago, 30m window, long expired
        const approvedAt = Date.now();

        const expiry = await expiryAfterApproval(uploadId);
        expect(Math.abs(expiry - (approvedAt + 0.5 * 3_600_000))).toBeLessThan(
          10_000,
        );
      });
    });

    it('moves the bytes out of quarantine and into public storage', async () => {
      const uploadId = await attachedUpload('review');
      const { storedFilename } = await uploadRow(uploadId);

      expect(existsSync(join(QUARANTINE_DIR, storedFilename))).toBe(true);
      await service.approve(admin, uploadId, {}, req);

      // The whole point of QUARANTINE_DIR: the bytes become publicly readable
      // at the moment the database says the report may show them, and not one
      // request earlier.
      expect(existsSync(join(QUARANTINE_DIR, storedFilename))).toBe(false);
      expect(existsSync(join(UPLOADS_DIR, storedFilename))).toBe(true);
    });

    it('records the human verdict WITHOUT overwriting the machine decision', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(
        admin,
        uploadId,
        { reason: 'Injury photo, fine' },
        req,
      );

      const row = await uploadRow(uploadId);
      // "The model said review, a human approved it" — the sentence
      // photo-verification-schema.ts gave these columns separate lives for.
      expect(row.decision).toBe('review');
      expect(row.statusKey).toBe('passed');
      expect(row.reviewedById).toBe(adminUserId);
      expect(row.reviewedAt).not.toBeNull();
      expect(row.reviewReason).toBe('Injury photo, fine');
    });

    it('does NOT release while another photo is still awaiting review', async () => {
      const first = await attachedUpload('review');
      await attachedUpload('review');

      await service.approve(admin, first, {}, req);

      expect((await storedReport()).key).toBe('pending_review');
      // Nothing published — not even the photo that was approved. A report is a
      // single artefact; half of one in front of volunteers is the failure this
      // ordering exists to prevent.
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(0);
    });

    it('publishes the machine-PASSED siblings too, once the last held photo clears', async () => {
      // The bug this is really about: ReportsService.create() writes no
      // report_photos row for ANY photo on a held report, passed ones included.
      // A release that published only the approved photo would silently drop the
      // rest of the reporter's pictures and strand their bytes in quarantine.
      const passed = await attachedUpload('pass');
      const held = await attachedUpload('review');

      await service.approve(admin, held, {}, req);

      const photos = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, reportId));
      expect(photos).toHaveLength(2);
      expect(photos.map((p) => p.uploadId).sort()).toEqual(
        [passed, held].sort(),
      );
      expect((await storedReport()).key).toBe('open');
    });

    it('alerts the reporter only when the report actually goes live', async () => {
      const first = await attachedUpload('review');
      const second = await attachedUpload('review');

      await service.approve(admin, first, {}, req);
      // Still held by `second` — "your photo passed" would be a fact the
      // reporter can do nothing with, about a request nobody can see.
      expect(await db.select().from(alerts)).toHaveLength(0);

      await service.approve(admin, second, {}, req);
      const rows = await db.select().from(alerts);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: reporterId,
        type: 'report_photo_approved',
        // The ONLY one of the three that may carry a reportId: the report is
        // `open` by now, so the link survives AlertsService.list()'s
        // pre-publication filter and goes somewhere.
        reportId,
      });
      expect(rows[0].title).toBe('Request Published');
    });

    it('writes one audit entry naming the photo, the model verdict and the release', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(
        admin,
        uploadId,
        { reason: 'Looks legitimate' },
        req,
      );

      const { items, pagination } = await auditService.list({
        page: 1,
        limit: 10,
      });
      expect(pagination.total).toBe(1);
      expect(items[0]).toMatchObject({
        action: { key: 'report_photo.approve' },
        actor: { userId: adminUserId },
        target: {
          type: { key: 'report_photo' },
          id: uploadId,
          label: 'Blood needed at Apollo',
        },
        before: {
          reportId,
          machineDecision: 'review',
          verificationStatus: 'review_required',
          reportStatus: 'pending_review',
        },
        after: { verificationStatus: 'passed', reportReleased: true },
        reason: 'Looks legitimate',
      });
    });

    it('refuses an upload attached to a different report than expected', async () => {
      const otherReportId = await createHeldReport();
      const uploadId = await attachedUpload('review');

      await expect(
        service.approve(admin, uploadId, { reportId: otherReportId }, req),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_REPORT_MISMATCH' } });

      // Nothing happened: no verdict, no publication, no alert.
      expect((await uploadRow(uploadId)).reviewedAt).toBeNull();
      expect((await storedReport()).key).toBe('pending_review');
      expect(await db.select().from(alerts)).toHaveLength(0);
    });

    it('accepts a matching expected report id', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(admin, uploadId, { reportId }, req);
      expect((await storedReport()).key).toBe('open');
    });
  });

  describe('reject', () => {
    it('blocks the report and leaves the file alone', async () => {
      const uploadId = await attachedUpload('review');
      const { storedFilename } = await uploadRow(uploadId);

      await service.reject(admin, uploadId, {
        reason: 'Unrelated stock image',
      });

      expect((await storedReport()).key).toBe('rejected');
      expect((await uploadRow(uploadId)).statusKey).toBe('rejected');
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(0);
      // Retention owns removal. A rejection is the decision most likely to be
      // appealed and the bytes are the evidence.
      expect(existsSync(join(QUARANTINE_DIR, storedFilename))).toBe(true);
    });

    it('tells the reporter, in an alert they can actually see', async () => {
      const uploadId = await attachedUpload('review');
      await service.reject(admin, uploadId, {
        reason: 'Unrelated stock image',
      });

      const rows = await db.select().from(alerts);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: reporterId,
        type: 'report_photo_rejected',
      });

      // ⚠️ THE ASSERTION THIS WHOLE ALERT DESIGN TURNS ON. `reportId` is null
      // because AlertsService.list() drops any alert whose report fails
      // `notRemoved` — which covers `rejected` and `pending_review`, not just
      // soft deletes. Linking this alert to the report it is about would have
      // hidden it from the only person it was for, while every part of the
      // system reported success.
      expect(rows[0].reportId).toBeNull();
      const visible = await alertsService.list(reporterId);
      expect(visible.map((a) => a.type)).toContain('report_photo_rejected');
    });

    it('audits the refusal with its reason', async () => {
      const uploadId = await attachedUpload('review');
      await service.reject(admin, uploadId, {
        reason: 'Unrelated stock image',
      });

      const { items } = await auditService.list({ page: 1, limit: 10 });
      expect(items[0]).toMatchObject({
        action: { key: 'report_photo.reject' },
        target: { type: { key: 'report_photo' }, id: uploadId },
        after: { reportStatus: 'rejected' },
        reason: 'Unrelated stock image',
      });
    });

    it('never publishes a report a sibling photo already killed', async () => {
      const doomed = await attachedUpload('review');
      const other = await attachedUpload('review');

      await service.reject(admin, doomed, { reason: 'Explicit content' });
      // The remaining photo can still be cleared — a moderator has to be able to
      // empty the queue — but clearing it must not resurrect the request.
      await service.approve(admin, other, {}, req);

      expect((await storedReport()).key).toBe('rejected');
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(0);
    });
  });

  describe('request-new', () => {
    it('leaves the report pending and asks the reporter for another photo', async () => {
      const uploadId = await attachedUpload('review');

      await service.requestNew(admin, uploadId, {
        reason: 'Too dark to tell what this shows',
      });

      expect((await storedReport()).key).toBe('pending_review');
      expect((await uploadRow(uploadId)).statusKey).toBe('rejected');

      const rows = await db.select().from(alerts);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: reporterId,
        type: 'report_photo_replacement_requested',
        // Null for the same reason as the rejection alert: the report is still
        // `pending_review`, which `notRemoved` filters out.
        reportId: null,
      });
      const visible = await alertsService.list(reporterId);
      expect(visible.map((a) => a.type)).toContain(
        'report_photo_replacement_requested',
      );
    });

    it('audits it as a distinct action from a rejection', async () => {
      const uploadId = await attachedUpload('review');
      await service.requestNew(admin, uploadId, { reason: 'Too dark' });

      const { items } = await auditService.list({ page: 1, limit: 10 });
      expect(items[0]).toMatchObject({
        action: { key: 'report_photo.request_new' },
        // The fact that separates it from `report_photo.reject` in the log.
        after: { reportStatus: 'pending_review' },
      });
    });

    it('does not publish anything', async () => {
      const uploadId = await attachedUpload('review');
      const { storedFilename } = await uploadRow(uploadId);
      await service.requestNew(admin, uploadId, { reason: 'Too dark' });

      expect(existsSync(join(UPLOADS_DIR, storedFilename))).toBe(false);
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(0);
    });
  });

  describe('stale and duplicate decisions', () => {
    it('409s on a second decision on the same upload, whichever pair', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(admin, uploadId, {}, req);

      await expect(
        service.approve(admin, uploadId, {}, req),
      ).rejects.toMatchObject({
        response: { code: 'PHOTO_ALREADY_REVIEWED' },
      });
      await expect(
        service.reject(admin, uploadId, { reason: 'changed my mind' }),
      ).rejects.toMatchObject({
        response: { code: 'PHOTO_ALREADY_REVIEWED' },
      });
      await expect(
        service.requestNew(admin, uploadId, { reason: 'changed my mind' }),
      ).rejects.toMatchObject({
        response: { code: 'PHOTO_ALREADY_REVIEWED' },
      });
    });

    it('leaves exactly one audit row and one alert after the refused retries', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(admin, uploadId, {}, req);
      await expect(
        service.reject(admin, uploadId, { reason: 'nope' }),
      ).rejects.toThrow();

      // A refused decision must leave no trace at all — the whole reason the
      // claim, the release and the audit row share one transaction.
      expect(
        (await auditService.list({ page: 1, limit: 10 })).pagination.total,
      ).toBe(1);
      expect(await db.select().from(alerts)).toHaveLength(1);
    });

    it('refuses to decide on a photo whose report an admin has hidden', async () => {
      const uploadId = await attachedUpload('review');
      await db
        .update(reports)
        .set({ deletedAt: new Date() })
        .where(eq(reports.id, reportId));

      await expect(
        service.approve(admin, uploadId, {}, req),
      ).rejects.toMatchObject({ response: { code: 'REPORT_HIDDEN' } });
    });

    it('refuses to decide on a photo whose report has already published', async () => {
      const uploadId = await attachedUpload('review');
      await db
        .update(reports)
        .set({ statusId: lookups.reportStatusIds.open })
        .where(eq(reports.id, reportId));

      await expect(
        service.reject(admin, uploadId, { reason: 'too late' }),
      ).rejects.toMatchObject({
        response: { code: 'REPORT_NOT_PENDING_REVIEW' },
      });
    });

    it('refuses to decide on an upload that was never submitted with a report', async () => {
      const uploadId = await attachedUpload('review', null);
      await expect(
        service.approve(admin, uploadId, {}, req),
      ).rejects.toMatchObject({ response: { code: 'PHOTO_NOT_ATTACHED' } });
    });

    it('404s for an unknown upload id', async () => {
      await expect(
        service.approve(admin, uuidv7(), {}, req),
      ).rejects.toMatchObject({
        response: { code: 'PHOTO_UPLOAD_NOT_FOUND' },
      });
    });

    it('leaves no audit row when the decision fails', async () => {
      await expect(service.approve(admin, uuidv7(), {}, req)).rejects.toThrow();
      expect(
        (await auditService.list({ page: 1, limit: 10 })).pagination.total,
      ).toBe(0);
    });
  });

  describe('the state machine', () => {
    /**
     * Every terminal state refuses every further decision, and the refusal is a
     * 409 rather than a 400: nothing about the request is malformed. The photo
     * has simply moved on, and the caller's view of it has not.
     */
    const TERMINAL = ['approve', 'reject', 'requestNew'] as const;

    it.each(TERMINAL)(
      '%s leaves the upload closed to all three',
      async (first) => {
        const uploadId = await attachedUpload('review');

        if (first === 'approve')
          await service.approve(admin, uploadId, {}, req);
        else if (first === 'reject')
          await service.reject(admin, uploadId, { reason: 'first decision' });
        else
          await service.requestNew(admin, uploadId, {
            reason: 'first decision',
          });

        await expect(
          service.approve(admin, uploadId, {}, req),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: 'PHOTO_ALREADY_REVIEWED' },
        });
        await expect(
          service.reject(admin, uploadId, { reason: 'second decision' }),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: 'PHOTO_ALREADY_REVIEWED' },
        });
        await expect(
          service.requestNew(admin, uploadId, { reason: 'second decision' }),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: 'PHOTO_ALREADY_REVIEWED' },
        });
      },
    );

    it('lets exactly one of two concurrent approvals win', async () => {
      // The race the guarded UPDATE ... WHERE reviewed_at IS NULL exists for.
      // Checking `reviewedAt` before opening the transaction cannot close it —
      // both callers would read null and both would publish, sending the
      // reporter two contradictory alerts about one request.
      const uploadId = await attachedUpload('review');

      const outcomes = await Promise.allSettled([
        service.approve(admin, uploadId, {}, req),
        service.approve(admin, uploadId, {}, req),
      ]);

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const loser = outcomes.find((o) => o.status === 'rejected');
      expect(loser).toBeDefined();
      expect((loser as PromiseRejectedResult).reason).toMatchObject({
        status: 409,
        response: { code: 'PHOTO_ALREADY_REVIEWED' },
      });

      // The consequences happened exactly once, which is the assertion that
      // actually matters — a second winner would be a duplicate photo card and
      // a second alert, not merely a second HTTP 200.
      expect(
        await db
          .select()
          .from(reportPhotos)
          .where(eq(reportPhotos.reportId, reportId)),
      ).toHaveLength(1);
      expect(await db.select().from(alerts)).toHaveLength(1);
      expect(
        (await auditService.list({ page: 1, limit: 10 })).pagination.total,
      ).toBe(1);
    });

    it('never creates a duplicate report_photos row for one upload', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(admin, uploadId, {}, req);

      // Force the report back to `pending_review` and drive a release again, as
      // a retry or a re-linked sibling would. The `not exists` guard in
      // publishPhotos is what keeps the photo from being published twice.
      await db
        .update(reports)
        .set({ statusId: lookups.reportStatusIds.pending_review })
        .where(eq(reports.id, reportId));
      await photoModeration.publishIfReady(db, reportId, req);

      const photos = await db
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, reportId));
      expect(photos).toHaveLength(1);
      expect(photos[0].uploadId).toBe(uploadId);
    });

    it('leaves a request-new photo permanently unusable', async () => {
      // The replacement has to go through POST /uploads/report-photo like any
      // other capture. This photo can be neither re-approved (it is reviewed)
      // nor re-attached (`resolveUploads` only accepts uploads with a null
      // report_id), so there is no second attach path to accidentally build.
      const uploadId = await attachedUpload('review');
      await service.requestNew(admin, uploadId, { reason: 'Too dark' });

      await expect(
        service.approve(admin, uploadId, {}, req),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'PHOTO_ALREADY_REVIEWED' },
      });

      const [row] = await db
        .select({ reportId: photoUploads.reportId })
        .from(photoUploads)
        .where(eq(photoUploads.id, uploadId));
      // Still attached, so it can never be resolved onto a different report.
      expect(row.reportId).toBe(reportId);
    });

    it('publishes a photo held only by a category switch, without re-judging it', async () => {
      // `resolveUploads` holds a report when the photo was judged against a
      // different category than the one it was filed under — a real bypass, and
      // one whose answer is a human looking at the image. The moderator's
      // approval must stand: nothing here re-derives relevance, and the
      // capture-time category stays exactly as recorded.
      const uploadId = await attachedUpload('pass');
      await db
        .update(photoUploads)
        .set({ categoryId: lookups.categoryIds.animalRescue })
        .where(eq(photoUploads.id, uploadId));

      await service.approve(admin, uploadId, {}, req);

      expect((await storedReport()).key).toBe('open');
      const detail = await service.findOne(uploadId);
      expect(detail.judgedCategory).toMatchObject({ key: 'animalRescue' });
      // The report is still filed under the category the reporter chose.
      expect(detail.categoryKey).toBe('medicalHelp');
    });
  });

  describe('summary', () => {
    const summaryQuery = { timeZone: 'Asia/Kolkata' };

    /** Marks an upload `failed` — what a provider outage actually records. */
    async function markFailed(uploadId: string): Promise<void> {
      const [failed] = await db
        .select({ id: photoVerificationStatuses.id })
        .from(photoVerificationStatuses)
        .where(eq(photoVerificationStatuses.key, 'failed'));
      await db
        .update(photoUploads)
        .set({ statusId: failed.id })
        .where(eq(photoUploads.id, uploadId));
    }

    it('counts photos whose verification FAILED, not just those flagged', async () => {
      // The badge read ZERO while twelve reports waited, observed live against
      // the running container. A photo whose provider call never completed is
      // recorded `failed`, not `review_required` — and with no AWS credentials
      // configured, which is every environment today, that is the whole queue.
      // Counting only `review_required` made the badge a promise of "nothing to
      // do" over a full queue.
      const flagged = await attachedUpload('review');
      const failedUpload = await attachedUpload('review');
      await markFailed(failedUpload);

      const summary = await service.summary(summaryQuery);
      expect(summary.pendingReview).toBe(2);
      expect(flagged).toBeDefined();
    });

    it('agrees with the queue the badge actually opens', async () => {
      // The badge is a promise about what the moderator finds when they click
      // it, so it must match the RESTING filter — `awaiting` — not one status.
      await attachedUpload('review');
      const failedUpload = await attachedUpload('review');
      await markFailed(failedUpload);

      const summary = await service.summary(summaryQuery);
      const queue = await service.list({
        page: 1,
        limit: 25,
        status: 'awaiting',
        sort: 'createdAt',
        order: 'asc',
      });

      expect(summary.pendingReview).toBe(queue.pagination.total);
    });

    it('stops counting a photo once a moderator has decided about it', async () => {
      const uploadId = await attachedUpload('review');
      expect((await service.summary(summaryQuery)).pendingReview).toBe(1);

      await service.approve(admin, uploadId, {}, req);
      expect((await service.summary(summaryQuery)).pendingReview).toBe(0);
    });

    it('counts exactly what the default queue lists', async () => {
      await attachedUpload('review');
      await attachedUpload('review');
      await attachedUpload('pass');
      await attachedUpload('review', null);

      const summary = await service.summary(summaryQuery);
      const queue = await service.list({
        page: 1,
        limit: 25,
        status: 'review_required',
        sort: 'createdAt',
        order: 'asc',
      });

      // The badge is a promise about what the moderator finds when they click
      // it. Two numbers that could disagree read as a broken queue.
      expect(summary.pendingReview).toBe(queue.pagination.total);
      expect(summary.pendingReview).toBe(2);
      // The passed photo and the unattached one both arrived today.
      expect(summary.today).toBe(3);
      expect(summary.timeZone).toBe('Asia/Kolkata');
    });

    it('counts high risk only among photos still awaiting a decision', async () => {
      const high = await attachedUpload('review');
      await db
        .update(photoUploads)
        .set({ riskLevel: 'high' })
        .where(eq(photoUploads.id, high));

      expect((await service.summary(summaryQuery)).highRisk).toBe(1);

      await service.approve(admin, high, {}, req);
      // A number that only ever goes up is decoration, not a work signal.
      expect((await service.summary(summaryQuery)).highRisk).toBe(0);
    });

    it('drains as the queue is worked', async () => {
      const first = await attachedUpload('review');
      const second = await attachedUpload('review');
      expect((await service.summary(summaryQuery)).pendingReview).toBe(2);

      await service.reject(admin, first, { reason: 'Explicit content' });
      expect((await service.summary(summaryQuery)).pendingReview).toBe(1);

      await service.requestNew(admin, second, { reason: 'Too dark' });
      const drained = await service.summary(summaryQuery);
      expect(drained.pendingReview).toBe(0);
      // Throughput, not backlog — both still arrived today.
      expect(drained.today).toBe(2);
    });

    it("honours the caller's day boundary", async () => {
      const uploadId = await attachedUpload('review');
      // Two days back, so it is "not today" in every zone on earth — the
      // assertion stays true whatever the CI box's clock is set to.
      await db
        .update(photoUploads)
        .set({ createdAt: new Date(Date.now() - 48 * HOUR) })
        .where(eq(photoUploads.id, uploadId));

      const summary = await service.summary(summaryQuery);
      expect(summary.today).toBe(0);
      // Still work waiting, though — the two cards measure different things.
      expect(summary.pendingReview).toBe(1);
    });
  });

  describe('the queue', () => {
    const query = {
      page: 1,
      limit: 25,
      status: 'review_required' as const,
      sort: 'createdAt' as const,
      order: 'asc' as const,
    };

    it('defaults to the photos that actually need a decision', async () => {
      const held = await attachedUpload('review');
      await attachedUpload('pass');

      const { items, pagination } = await service.list(query);
      expect(pagination.total).toBe(1);
      expect(items[0]).toMatchObject({
        id: held,
        reportId,
        reportTitle: 'Blood needed at Apollo',
        categoryKey: 'medicalHelp',
        categoryLabel: 'Medical Help',
        verificationStatus: 'review_required',
        decision: 'review',
        riskLevel: 'medium',
        reportStatus: 'pending_review',
        reporter: { id: reporterId, name: 'Hari S' },
      });
      expect(items[0].reasons).toEqual([]);
    });

    it('drops a photo out of the queue once it has been decided', async () => {
      const held = await attachedUpload('review');
      expect((await service.list(query)).pagination.total).toBe(1);

      await service.approve(admin, held, {}, req);
      expect((await service.list(query)).pagination.total).toBe(0);
      // Not vanished — findable under its new status, which is what makes a
      // past decision reviewable.
      expect(
        (await service.list({ ...query, status: 'passed' })).pagination.total,
      ).toBe(1);
    });

    it('never lists an upload that was never submitted with a report', async () => {
      // No report to publish it onto and nobody waiting on the answer. Listing
      // it would fill a work queue with rows whose only correct action is to
      // ignore them.
      await attachedUpload('review', null);
      expect((await service.list(query)).pagination.total).toBe(0);
    });

    it('filters by risk, category and free text', async () => {
      const held = await attachedUpload('review');

      expect(
        (await service.list({ ...query, risk: 'medium' })).pagination.total,
      ).toBe(1);
      expect(
        (await service.list({ ...query, risk: 'high' })).pagination.total,
      ).toBe(0);
      expect(
        (await service.list({ ...query, categoryKey: 'medicalHelp' }))
          .pagination.total,
      ).toBe(1);
      expect(
        (await service.list({ ...query, categoryKey: 'animalRescue' }))
          .pagination.total,
      ).toBe(0);
      // Over the report's title, description and landmark.
      expect(
        (await service.list({ ...query, q: 'Apollo' })).pagination.total,
      ).toBe(1);
      expect(
        (await service.list({ ...query, q: 'bus stand' })).pagination.total,
      ).toBe(1);
      expect(
        (await service.list({ ...query, q: 'nothing here' })).pagination.total,
      ).toBe(0);
      expect(
        (await service.list({ ...query, status: 'all' })).items[0].id,
      ).toBe(held);
    });

    it('orders oldest-first by default — this is a queue, not an audit log', async () => {
      const first = await attachedUpload('review');
      const second = await attachedUpload('review');

      expect((await service.list(query)).items.map((i) => i.id)).toEqual([
        first,
        second,
      ]);
      expect(
        (await service.list({ ...query, order: 'desc' })).items.map(
          (i) => i.id,
        ),
      ).toEqual([second, first]);
    });
  });

  describe('detail and file access', () => {
    it('exposes the provider detail the citizen response withholds', async () => {
      const uploadId = await attachedUpload('review');
      const detail = await service.findOne(uploadId);

      expect(detail).toMatchObject({
        id: uploadId,
        provider: 'fixture',
        width: 800,
        height: 600,
        mimeType: 'image/jpeg',
        verificationStatus: 'review_required',
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
      });
      expect(detail.signals).toEqual({});
      // The category relevance was judged against, which is not read through
      // the report — see photo-verification-schema.ts.
      expect(detail.judgedCategory).toMatchObject({ key: 'medicalHelp' });
      expect(detail.report).toMatchObject({
        id: reportId,
        title: 'Blood needed at Apollo',
        description: 'O negative urgently required.',
        landmark: 'Near the bus stand',
        lat: 13.08,
        lng: 80.27,
        storedStatus: 'pending_review',
      });
    });

    it('says how many photos still hold the report, so Approve is not a guess', async () => {
      const held = await attachedUpload('review');
      await attachedUpload('review');
      await attachedUpload('pass');

      expect((await service.findOne(held)).report?.photos).toMatchObject({
        total: 3,
        publishable: 1,
        awaitingReview: 2,
        refused: 0,
      });
    });

    it('names the moderator who decided', async () => {
      const uploadId = await attachedUpload('review');
      await service.approve(admin, uploadId, { reason: 'Fine' }, req);

      const detail = await service.findOne(uploadId);
      // Aliased join — without it both `user` joins resolve to the reporter and
      // the console credits the wrong person for the decision.
      expect(detail.reviewedBy).toMatchObject({
        id: adminUserId,
        name: 'Super Admin',
      });
      expect(detail.reviewReason).toBe('Fine');
    });

    it('resolves the quarantined file, and the public one after publication', async () => {
      const uploadId = await attachedUpload('review');

      const held = await service.fileFor(uploadId);
      expect(held.path.startsWith(QUARANTINE_DIR)).toBe(true);
      expect(held.mimeType).toBe('image/jpeg');

      await service.approve(admin, uploadId, {}, req);

      // The bytes moved. Refusing here would hide from a moderator reviewing
      // their own decision an image every citizen can already fetch.
      const published = await service.fileFor(uploadId);
      expect(published.path.startsWith(UPLOADS_DIR)).toBe(true);
    });

    it('404s when there is no upload, and when there are no bytes left', async () => {
      await expect(service.fileFor(uuidv7())).rejects.toMatchObject({
        response: { code: 'PHOTO_FILE_NOT_FOUND' },
      });

      const uploadId = await attachedUpload('review');
      const { storedFilename } = await uploadRow(uploadId);
      removePhotoUploadFixture(storedFilename);
      await expect(service.fileFor(uploadId)).rejects.toMatchObject({
        response: { code: 'PHOTO_FILE_NOT_FOUND' },
      });
    });
  });

  describe('a reporter who has deleted their account', () => {
    it('is still reviewable, and nobody is notified', async () => {
      const uploadId = await attachedUpload('review');
      // SET NULL, exactly as UsersService.deleteAccount() leaves it.
      await db
        .update(reports)
        .set({ reporterId: null })
        .where(eq(reports.id, reportId));

      await service.approve(admin, uploadId, {}, req);

      expect((await storedReport()).key).toBe('open');
      expect(await db.select().from(alerts)).toHaveLength(0);
      expect((await service.findOne(uploadId)).reporter).toBeNull();
    });
  });
});
